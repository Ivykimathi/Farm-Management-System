# Copyright (c) 2026, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


PACKAGING_ITEM_GROUP = "Packaging Items"


class PackagingItem(Document):
	def validate(self):
		# Validate attached products
		seen = set()
		for row in self.attached_products or []:
			if not row.product:
				continue
			if row.product in seen:
				frappe.throw(_("Product {0} is listed more than once in Attached Products").format(row.product))
			seen.add(row.product)
			if not row.units_per_package or row.units_per_package <= 0:
				# Default to packaging item capacity if not set
				row.units_per_package = self.capacity or 0
			if not row.units_per_package or row.units_per_package <= 0:
				frappe.throw(_("Attached Product {0}: Units / Package must be greater than zero").format(row.product))

	def after_insert(self):
		self.ensure_linked_item()
		self.refresh_current_stock()
		self.sync_attached_products_to_config()

	def on_update(self):
		if not self.linked_item:
			self.ensure_linked_item()
		else:
			self.sync_linked_item()
		self.refresh_current_stock()
		self.sync_attached_products_to_config()

	def ensure_linked_item(self):
		"""Auto-create an ERPNext Item that backs this packaging item for stock tracking."""
		ensure_packaging_item_group()
		item_code = f"PKG-{self.name}"[:140]

		if frappe.db.exists("Item", item_code):
			self.db_set("linked_item", item_code, update_modified=False)
			return

		item = frappe.get_doc({
			"doctype": "Item",
			"item_code": item_code,
			"item_name": self.packaging_item_name,
			"item_group": PACKAGING_ITEM_GROUP,
			"stock_uom": self.default_uom or "Nos",
			"is_stock_item": 1,
			"is_purchase_item": 1,
			"is_sales_item": 0,
			"description": self.notes or self.packaging_item_name,
		})
		item.insert(ignore_permissions=True)
		self.db_set("linked_item", item.name, update_modified=False)

	def sync_linked_item(self):
		"""Keep the backing Item in sync with edits to the packaging item."""
		if not self.linked_item or not frappe.db.exists("Item", self.linked_item):
			return
		updates = {
			"item_name": self.packaging_item_name,
			"description": self.notes or self.packaging_item_name,
		}
		if self.default_uom:
			updates["stock_uom"] = self.default_uom
		frappe.db.set_value("Item", self.linked_item, updates, update_modified=False)

	def refresh_current_stock(self):
		qty = get_item_total_stock(self.linked_item) if self.linked_item else 0.0
		if (self.current_stock or 0.0) != qty:
			self.db_set("current_stock", qty, update_modified=False)

	def sync_attached_products_to_config(self):
		"""Keep Product Packaging Config in sync with this packaging item's attached products.

		- Creates a PPC for every (product, this packaging item) pair in the child table.
		- Updates units_per_package if it changed.
		- Deletes PPCs for this packaging item that are no longer in the table.
		"""
		desired = {}
		for row in self.attached_products or []:
			if not row.product or not row.units_per_package:
				continue
			ptype = resolve_product_type(row.product)
			if not ptype:
				continue
			desired[row.product] = {
				"product_type": ptype,
				"units_per_package": row.units_per_package,
				"notes": row.notes,
			}

		existing = frappe.db.get_all(
			"Product Packaging Config",
			filters={"packaging_item": self.name},
			fields=["name", "product", "units_per_package"],
		)
		existing_by_product = {e["product"]: e for e in existing}

		# Create or update
		for product, payload in desired.items():
			if product in existing_by_product:
				ppc = existing_by_product[product]
				if float(ppc["units_per_package"] or 0) != float(payload["units_per_package"]):
					frappe.db.set_value(
						"Product Packaging Config", ppc["name"],
						{"units_per_package": payload["units_per_package"], "notes": payload.get("notes")},
					)
			else:
				doc = frappe.get_doc({
					"doctype": "Product Packaging Config",
					"product_type": payload["product_type"],
					"product": product,
					"packaging_item": self.name,
					"units_per_package": payload["units_per_package"],
					"notes": payload.get("notes"),
				})
				doc.insert(ignore_permissions=True)

		# Delete orphans
		for product, ppc in existing_by_product.items():
			if product not in desired:
				frappe.delete_doc("Product Packaging Config", ppc["name"], force=1, ignore_permissions=True)


def resolve_product_type(item_name):
	"""Decide which farm doctype (Animal Products / Crop Products) the item belongs to."""
	if frappe.db.exists("Animal Products", item_name):
		return "Animal Product"
	if frappe.db.exists("Crop Products", item_name):
		return "Crop Product"
	return None


def ensure_packaging_item_group():
	if frappe.db.exists("Item Group", PACKAGING_ITEM_GROUP):
		return
	parent = frappe.db.get_value("Item Group", {"is_group": 1, "parent_item_group": ["in", ["", None]]}, "name")
	if not parent:
		parent = frappe.db.get_value("Item Group", {"is_group": 1}, "name") or "All Item Groups"
	group = frappe.get_doc({
		"doctype": "Item Group",
		"item_group_name": PACKAGING_ITEM_GROUP,
		"parent_item_group": parent,
		"is_group": 0,
	})
	group.insert(ignore_permissions=True)


def get_item_total_stock(item_code):
	if not item_code:
		return 0.0
	qty = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(actual_qty), 0)
		FROM `tabBin`
		WHERE item_code = %s
		""",
		(item_code,),
	)
	return float(qty[0][0]) if qty else 0.0


@frappe.whitelist()
def refresh_stock(name):
	"""Public method to refresh current_stock from Bin records."""
	doc = frappe.get_doc("Packaging Item", name)
	doc.refresh_current_stock()
	return doc.current_stock


@frappe.whitelist()
def get_farm_products(doctype, txt, searchfield, start, page_len, filters):
	"""Dropdown query for Packaging Item Product.product field.

	Returns Items that back an Animal Product or Crop Product record.
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
