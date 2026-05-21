# Copyright (c) 2026, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class PackagingItemPurchase(Document):
	def validate(self):
		if self.qty_purchased and self.qty_purchased <= 0:
			frappe.throw(_("Qty Purchased must be greater than zero"))
		if self.rate is None:
			self.rate = 0
		self.total_amount = (self.qty_purchased or 0) * (self.rate or 0)
		if not self.linked_item:
			self.linked_item = frappe.db.get_value("Packaging Item", self.packaging_item, "linked_item")
		if not self.linked_item:
			frappe.throw(_("Selected Packaging Item is not linked to a stock Item yet. Open the Packaging Item and save it once."))

	def on_submit(self):
		stock_entry = frappe.get_doc({
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Receipt",
			"posting_date": self.date,
			"items": [{
				"item_code": self.linked_item,
				"qty": self.qty_purchased,
				"uom": frappe.db.get_value("Item", self.linked_item, "stock_uom"),
				"basic_rate": self.rate or 0,
				"t_warehouse": self.warehouse,
			}],
		})
		stock_entry.insert(ignore_permissions=True)
		stock_entry.submit()
		self.db_set("stock_entry_reference", stock_entry.name)

		packaging_item = frappe.get_doc("Packaging Item", self.packaging_item)
		packaging_item.refresh_current_stock()

	def on_cancel(self):
		if self.stock_entry_reference:
			se = frappe.get_doc("Stock Entry", self.stock_entry_reference)
			if se.docstatus == 1:
				se.cancel()
		packaging_item = frappe.get_doc("Packaging Item", self.packaging_item)
		packaging_item.refresh_current_stock()
