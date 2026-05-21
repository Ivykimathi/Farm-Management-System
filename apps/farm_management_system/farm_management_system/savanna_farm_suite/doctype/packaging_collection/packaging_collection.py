# Copyright (c) 2026, Techsavanna Technology and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe import _
from frappe.model.document import Document


PACKAGED_PRODUCT_ITEM_GROUP = "Packaged Products"


class PackagingCollection(Document):
	def validate(self):
		if not self.packaging_line_items:
			frappe.throw(_("Add at least one packaging line item"))

		total_packed = 0.0
		seen = set()
		for line in self.packaging_line_items:
			if not line.product:
				frappe.throw(_("Row {0}: Product is required").format(line.idx))
			if not line.packaging_item:
				frappe.throw(_("Row {0}: Packaging Item is required").format(line.idx))

			key = (line.product, line.packaging_item)
			if key in seen:
				frappe.throw(_(
					"Row {0}: {1} → {2} is duplicated; combine the rows"
				).format(line.idx, line.product, line.packaging_item))
			seen.add(key)

			if not line.units_per_package:
				line.units_per_package = self._lookup_units_per_package(
					line.product, line.packaging_item
				)
			if not line.units_per_package:
				frappe.throw(_(
					"Row {0}: Configure Product Packaging Config for {1} → {2} first"
				).format(line.idx, line.product, line.packaging_item))

			if not line.quantity or line.quantity <= 0:
				frappe.throw(_("Row {0}: Quantity must be greater than zero").format(line.idx))

			line.total_units = (line.quantity or 0) * (line.units_per_package or 0)
			total_packed += line.total_units

			if not line.linked_item:
				line.linked_item = frappe.db.get_value(
					"Packaging Item", line.packaging_item, "linked_item"
				)

		self.total_packed = total_packed

	def _lookup_units_per_package(self, product, packaging_item):
		"""Look up units_per_package from PPC by product name only (item_code is unique
		across both Crop and Animal Products)."""
		cfg = frappe.db.get_value(
			"Product Packaging Config",
			{"product": product, "packaging_item": packaging_item},
			"units_per_package",
		)
		if cfg:
			return cfg
		return frappe.db.get_value("Packaging Item", packaging_item, "capacity")

	def before_submit(self):
		self._check_stock_availability()

	def _check_stock_availability(self):
		for line in self.packaging_line_items:
			if not line.linked_item:
				continue
			available = frappe.db.sql(
				"SELECT COALESCE(SUM(actual_qty), 0) FROM `tabBin` "
				"WHERE item_code = %s AND warehouse = %s",
				(line.linked_item, self.warehouse),
			)
			qty = float(available[0][0]) if available else 0.0
			if qty < (line.quantity or 0):
				frappe.throw(_(
					"Not enough stock of {0} in {1}: have {2}, need {3}"
				).format(line.packaging_item, self.warehouse, qty, line.quantity))

	def on_submit(self):
		items = []

		# Aggregate sources so we don't duplicate item rows in the Stock Entry
		container_qty = defaultdict(float)        # linked container item -> qty (packs)
		product_qty = defaultdict(float)          # raw product item -> total units consumed
		target_qty = defaultdict(lambda: {"qty": 0.0, "row_idxes": []})  # packaged item -> {qty, rows}

		for line in self.packaging_line_items:
			if not line.linked_item:
				continue
			if not line.product or not frappe.db.exists("Item", line.product):
				continue

			packaged_code = ensure_packaged_product_item(line.product, line.packaging_item)
			line.db_set("packaged_item", packaged_code, update_modified=False)

			container_qty[line.linked_item] += (line.quantity or 0)
			product_qty[line.product] += (line.total_units or 0)
			target_qty[packaged_code]["qty"] += (line.quantity or 0)
			target_qty[packaged_code]["row_idxes"].append(line.idx)

		# Source: containers
		for code, qty in container_qty.items():
			if qty <= 0:
				continue
			items.append({
				"item_code": code,
				"qty": qty,
				"uom": frappe.db.get_value("Item", code, "stock_uom"),
				"s_warehouse": self.warehouse,
			})

		# Source: raw products
		for code, qty in product_qty.items():
			if qty <= 0:
				continue
			items.append({
				"item_code": code,
				"qty": qty,
				"uom": frappe.db.get_value("Item", code, "stock_uom"),
				"s_warehouse": self.warehouse,
			})

		# Target: packaged products produced
		for code, payload in target_qty.items():
			if payload["qty"] <= 0:
				continue
			items.append({
				"item_code": code,
				"qty": payload["qty"],
				"uom": frappe.db.get_value("Item", code, "stock_uom"),
				"t_warehouse": self.warehouse,
			})

		if not items or not target_qty:
			return

		stock_entry = frappe.get_doc({
			"doctype": "Stock Entry",
			"stock_entry_type": "Repack",
			"posting_date": self.date,
			"items": items,
		})
		stock_entry.insert(ignore_permissions=True)
		stock_entry.submit()

		self.db_set("product_stock_entry", stock_entry.name)
		for line in self.packaging_line_items:
			line.db_set("stock_entry_reference", stock_entry.name, update_modified=False)

		for line in self.packaging_line_items:
			pkg = frappe.get_doc("Packaging Item", line.packaging_item)
			pkg.refresh_current_stock()

	def on_cancel(self):
		if self.product_stock_entry:
			try:
				se = frappe.get_doc("Stock Entry", self.product_stock_entry)
				if se.docstatus == 1:
					se.cancel()
			except Exception:
				frappe.log_error(frappe.get_traceback(), "PackagingCollection.on_cancel")

		for line in self.packaging_line_items:
			try:
				pkg = frappe.get_doc("Packaging Item", line.packaging_item)
				pkg.refresh_current_stock()
			except Exception:
				pass


@frappe.whitelist()
def get_packaged_product_summary():
	"""Hub data: per packaged-product Item, return current stock, packs made (lifetime),
	and packs sold this month. Used by the Packaging Management page."""
	rows = frappe.db.sql(
		"""
		SELECT
			i.name                           AS item_code,
			i.item_name                      AS item_name,
			COALESCE(b.actual_qty, 0)        AS current_stock,
			COALESCE(made.qty, 0)            AS packs_made,
			COALESCE(sold.qty, 0)            AS packs_sold_mtd
		FROM `tabItem` i
		LEFT JOIN (
			SELECT item_code, SUM(actual_qty) AS actual_qty
			FROM `tabBin`
			GROUP BY item_code
		) b ON b.item_code = i.name
		LEFT JOIN (
			SELECT item_code, SUM(actual_qty) AS qty
			FROM `tabStock Ledger Entry`
			WHERE is_cancelled = 0 AND actual_qty > 0
			GROUP BY item_code
		) made ON made.item_code = i.name
		LEFT JOIN (
			SELECT item_code, SUM(-actual_qty) AS qty
			FROM `tabStock Ledger Entry`
			WHERE is_cancelled = 0
			  AND actual_qty < 0
			  AND voucher_type IN ('Delivery Note', 'Sales Invoice')
			  AND posting_date >= DATE_FORMAT(CURDATE(), '%%Y-%%m-01')
			GROUP BY item_code
		) sold ON sold.item_code = i.name
		WHERE i.disabled = 0
		  AND i.item_group = %(grp)s
		ORDER BY i.item_name ASC
		""",
		{"grp": PACKAGED_PRODUCT_ITEM_GROUP},
		as_dict=True,
	)
	return rows


def ensure_packaged_product_item(product, packaging_item):
	"""Get or create the Item that represents (product × packaging_item) as a sellable pack.

	The packaged item lives in the "Packaged Products" item group and is is_sales_item=1
	so it shows up in Sales Invoice / Delivery Note / Stock Balance. Sales depleting this
	item is what makes "packed 110, sold 100, 10 remaining" work end-to-end.
	"""
	ensure_packaged_product_group()
	item_code = f"PKD-{packaging_item}-{product}"[:140]

	if frappe.db.exists("Item", item_code):
		return item_code

	product_info = frappe.db.get_value("Item", product, ["item_name", "stock_uom"], as_dict=True) or {}
	pkg_name = frappe.db.get_value("Packaging Item", packaging_item, "packaging_item_name") or packaging_item

	item = frappe.get_doc({
		"doctype": "Item",
		"item_code": item_code,
		"item_name": f"{product_info.get('item_name') or product} ({pkg_name})"[:140],
		"item_group": PACKAGED_PRODUCT_ITEM_GROUP,
		"stock_uom": "Nos",
		"is_stock_item": 1,
		"is_sales_item": 1,
		"is_purchase_item": 0,
		"description": f"Packaged product: {product} in {pkg_name}",
	})
	item.insert(ignore_permissions=True)
	return item.name


def ensure_packaged_product_group():
	if frappe.db.exists("Item Group", PACKAGED_PRODUCT_ITEM_GROUP):
		return
	parent = frappe.db.get_value(
		"Item Group", {"is_group": 1, "parent_item_group": ["in", ["", None]]}, "name"
	)
	if not parent:
		parent = frappe.db.get_value("Item Group", {"is_group": 1}, "name") or "All Item Groups"
	frappe.get_doc({
		"doctype": "Item Group",
		"item_group_name": PACKAGED_PRODUCT_ITEM_GROUP,
		"parent_item_group": parent,
		"is_group": 0,
	}).insert(ignore_permissions=True)


@frappe.whitelist()
def get_products_filter(doctype, txt, searchfield, start, page_len, filters):
	"""Dropdown query for the row-level Product field.

	Returns only the Items that back an Animal Product or Crop Product record —
	excludes other stock items (animals themselves, feeds, packaging, etc.).
	"""
	return frappe.db.sql(
		"""
		SELECT i.name, i.item_name
		FROM `tabItem` i
		WHERE i.disabled = 0
		  AND i.name LIKE %(txt)s
		  AND (
			i.name IN (SELECT name FROM `tabAnimal Products`)
			OR i.name IN (SELECT name FROM `tabCrop Products`)
		  )
		ORDER BY i.name ASC
		LIMIT %(start)s, %(page_len)s
		""",
		{
			"txt": f"%{txt}%",
			"start": int(start or 0),
			"page_len": int(page_len or 20),
		},
	)


@frappe.whitelist()
def get_packaging_items_filter(doctype, txt, searchfield, start, page_len, filters):
	"""Restrict the Packaging Item field to items configured for the row's product
	(via Product Packaging Config). Falls back to all packaging items if no product
	is selected on the row.
	"""
	product = (filters or {}).get("product")

	if product:
		return frappe.db.sql(
			"""
			SELECT pi.name, pi.capacity
			FROM `tabPackaging Item` pi
			INNER JOIN `tabProduct Packaging Config` ppc ON ppc.packaging_item = pi.name
			WHERE ppc.product = %(p)s
			  AND pi.name LIKE %(txt)s
			ORDER BY pi.capacity ASC
			LIMIT %(start)s, %(page_len)s
			""",
			{
				"p": product,
				"txt": f"%{txt}%",
				"start": int(start or 0),
				"page_len": int(page_len or 20),
			},
		)

	return frappe.db.sql(
		"""
		SELECT name, capacity FROM `tabPackaging Item`
		WHERE name LIKE %(txt)s
		ORDER BY name ASC
		LIMIT %(start)s, %(page_len)s
		""",
		{
			"txt": f"%{txt}%",
			"start": int(start or 0),
			"page_len": int(page_len or 20),
		},
	)
