# Copyright (c) 2026, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ProductPackagingConfig(Document):
	def validate(self):
		if self.units_per_package and self.units_per_package <= 0:
			frappe.throw(_("Units Per Package must be greater than zero"))

		duplicate = frappe.db.exists(
			"Product Packaging Config",
			{
				"product_type": self.product_type,
				"product": self.product,
				"packaging_item": self.packaging_item,
				"name": ["!=", self.name],
			},
		)
		if duplicate:
			frappe.throw(
				_("A configuration for {0} → {1} already exists ({2})").format(
					self.product, self.packaging_item, duplicate
				)
			)


@frappe.whitelist()
def get_packaging_items_for_product(product_type, product):
	"""Return all packaging items configured for a given product, with capacity."""
	rows = frappe.db.get_all(
		"Product Packaging Config",
		filters={"product_type": product_type, "product": product},
		fields=["name", "packaging_item", "units_per_package"],
		order_by="units_per_package asc",
	)
	for r in rows:
		pkg = frappe.db.get_value(
			"Packaging Item",
			r["packaging_item"],
			["linked_item", "current_stock"],
			as_dict=True,
		) or {}
		r["linked_item"] = pkg.get("linked_item")
		r["current_stock"] = pkg.get("current_stock") or 0
	return rows
