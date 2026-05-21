# Copyright (c) 2026, Techsavanna Technology and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt, nowdate


PACKAGED_PRODUCT_ITEM_GROUP = "Packaged Products"


@frappe.whitelist()
def get_available_packaged_items(warehouse=None):
    """List packaged Items (item_group = Packaged Products) with current stock and a default rate."""
    rows = frappe.db.sql(
        """
        SELECT
            i.name                              AS item_code,
            i.item_name                         AS item_name,
            i.stock_uom                         AS uom,
            COALESCE(b.actual_qty, 0)           AS current_stock,
            COALESCE(price.price_list_rate, i.standard_rate, 0) AS default_rate,
            i.standard_rate                     AS standard_rate
        FROM `tabItem` i
        LEFT JOIN (
            SELECT item_code, SUM(actual_qty) AS actual_qty
            FROM `tabBin`
            WHERE (%(wh)s IS NULL OR warehouse = %(wh)s)
            GROUP BY item_code
        ) b ON b.item_code = i.name
        LEFT JOIN (
            SELECT item_code, price_list_rate
            FROM `tabItem Price`
            WHERE selling = 1
            ORDER BY modified DESC
        ) price ON price.item_code = i.name
        WHERE i.disabled = 0
          AND i.item_group = %(grp)s
        GROUP BY i.name
        ORDER BY i.item_name ASC
        """,
        {"grp": PACKAGED_PRODUCT_ITEM_GROUP, "wh": warehouse},
        as_dict=True,
    )
    return rows


@frappe.whitelist()
def get_default_warehouse():
    """Best-effort default warehouse for the sale dialog."""
    wh = frappe.db.get_single_value("Stock Settings", "default_warehouse")
    if wh:
        return wh
    return frappe.db.get_value("Warehouse", {"is_group": 0, "disabled": 0}, "name")


@frappe.whitelist()
def create_packaged_sale(customer, doc_type, items, warehouse=None, posting_date=None, notes=None):
    """Create a Sales Invoice or Delivery Note for packaged-product items.

    items is a list of dicts: [{"item_code": "...", "qty": 5, "rate": 100}, ...]
    """
    if isinstance(items, str):
        items = frappe.parse_json(items)

    if not customer:
        frappe.throw(_("Customer is required"))
    if doc_type not in ("Sales Invoice", "Delivery Note"):
        frappe.throw(_("doc_type must be 'Sales Invoice' or 'Delivery Note'"))
    if not items:
        frappe.throw(_("Add at least one packaged item to sell"))

    warehouse = warehouse or get_default_warehouse()
    if not warehouse:
        frappe.throw(_("No warehouse available — set a default warehouse on Company or pass one explicitly"))

    posting_date = posting_date or nowdate()

    doc = frappe.new_doc(doc_type)
    doc.customer = customer
    doc.posting_date = posting_date
    if doc_type == "Sales Invoice":
        # Without this, Sales Invoice is purely financial and does NOT move stock.
        doc.update_stock = 1
        doc.set_posting_time = 1
    elif doc_type == "Delivery Note":
        doc.set_posting_time = 1
    if notes:
        doc.remarks = notes

    for row in items:
        item_code = row.get("item_code")
        qty = flt(row.get("qty"))
        if not item_code or qty <= 0:
            continue
        line = {
            "item_code": item_code,
            "qty": qty,
            "warehouse": warehouse,
        }
        rate = flt(row.get("rate"))
        if rate > 0:
            line["rate"] = rate
        doc.append("items", line)

    if not doc.items:
        frappe.throw(_("All rows have zero quantity — nothing to sell"))

    doc.insert(ignore_permissions=False)
    doc.submit()
    frappe.db.commit()

    return {
        "name": doc.name,
        "doctype": doc.doctype,
        "grand_total": doc.grand_total,
    }
