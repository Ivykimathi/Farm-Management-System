# Copyright (c) 2026, Techsavanna Technology and contributors
# For license information, please see license.txt

from __future__ import annotations

from datetime import date, timedelta

import frappe
from frappe.utils import getdate, today


def get_date_range_for_timeline(timeline: str):
    td_today = getdate(today())
    if timeline == "This Week":
        start = td_today - timedelta(days=td_today.weekday())
        end = td_today
    elif timeline == "Last Fortnight":
        start = td_today - timedelta(days=13)
        end = td_today
    elif timeline == "This Month":
        start = date(td_today.year, td_today.month, 1)
        end = td_today
    elif timeline == "This Quarter":
        quarter_index = (td_today.month - 1) // 3
        start_month = quarter_index * 3 + 1
        start = date(td_today.year, start_month, 1)
        end = td_today
    elif timeline == "This Year":
        start = date(td_today.year, 1, 1)
        end = td_today
    else:
        start = date(td_today.year, td_today.month, 1)
        end = td_today
    return start, end


def execute(filters=None):
    filters = filters or {}

    timeline = (filters.get("timeline") or "").strip() or "This Month"
    start_date, end_date = get_date_range_for_timeline(timeline)

    columns = [
        {"label": "Date", "fieldname": "date", "fieldtype": "Date", "width": 110},
        {"label": "Collection", "fieldname": "collection", "fieldtype": "Link", "options": "Packaging Collection", "width": 170},
        {"label": "Warehouse", "fieldname": "warehouse", "fieldtype": "Link", "options": "Warehouse", "width": 160},
        {"label": "Product", "fieldname": "product", "fieldtype": "Link", "options": "Item", "width": 200},
        {"label": "Packaging Item", "fieldname": "packaging_item", "fieldtype": "Link", "options": "Packaging Item", "width": 180},
        {"label": "Units / Package", "fieldname": "units_per_package", "fieldtype": "Float", "width": 120},
        {"label": "Packages", "fieldname": "quantity", "fieldtype": "Float", "width": 110},
        {"label": "Total Units Packed", "fieldname": "total_units", "fieldtype": "Float", "width": 140},
        {"label": "Packaged Item", "fieldname": "packaged_item", "fieldtype": "Link", "options": "Item", "width": 220},
    ]

    conditions = ["pc.docstatus = 1", "pc.date BETWEEN %(start)s AND %(end)s"]
    params = {"start": start_date, "end": end_date}

    if filters.get("product"):
        conditions.append("pli.product = %(product)s")
        params["product"] = filters["product"]
    if filters.get("packaging_item"):
        conditions.append("pli.packaging_item = %(packaging_item)s")
        params["packaging_item"] = filters["packaging_item"]
    if filters.get("warehouse"):
        conditions.append("pc.warehouse = %(warehouse)s")
        params["warehouse"] = filters["warehouse"]

    where_clause = " AND ".join(conditions)

    rows = frappe.db.sql(
        f"""
        SELECT
            pc.date,
            pc.name AS collection,
            pc.warehouse,
            pli.product,
            pli.packaging_item,
            pli.units_per_package,
            pli.quantity,
            pli.total_units,
            pli.packaged_item
        FROM `tabPackaging Collection` pc
        INNER JOIN `tabPackaging Collection Item` pli
            ON pli.parent = pc.name
        WHERE {where_clause}
        ORDER BY pc.date DESC, pc.name DESC, pli.idx ASC
        """,
        params,
        as_dict=True,
    )

    return columns, rows
