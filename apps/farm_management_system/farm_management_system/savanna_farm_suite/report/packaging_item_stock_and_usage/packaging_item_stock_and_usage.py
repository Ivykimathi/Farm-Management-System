# Copyright (c) 2026, Techsavanna Technology and contributors
# For license information, please see license.txt

from __future__ import annotations

from datetime import date, timedelta

import frappe
from frappe.utils import getdate, today

LOW_STOCK_THRESHOLD = 20.0


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
    elif timeline == "All Time":
        return None, None
    else:
        start = date(td_today.year, td_today.month, 1)
        end = td_today
    return start, end


def execute(filters=None):
    filters = filters or {}

    timeline = (filters.get("timeline") or "").strip() or "This Month"
    start_date, end_date = get_date_range_for_timeline(timeline)

    columns = [
        {"label": "Packaging Item", "fieldname": "packaging_item", "fieldtype": "Link", "options": "Packaging Item", "width": 200},
        {"label": "Capacity (units/pack)", "fieldname": "capacity", "fieldtype": "Float", "width": 130},
        {"label": "Current Stock", "fieldname": "current_stock", "fieldtype": "Float", "width": 120},
        {"label": "Purchased (Period)", "fieldname": "purchased_qty", "fieldtype": "Float", "width": 140},
        {"label": "Purchase Cost (Period)", "fieldname": "purchase_cost", "fieldtype": "Currency", "width": 150},
        {"label": "Used in Packaging (Period)", "fieldname": "used_qty", "fieldtype": "Float", "width": 170},
        {"label": "Net Movement (Period)", "fieldname": "net_movement", "fieldtype": "Float", "width": 150},
        {"label": "Stock Status", "fieldname": "stock_status", "fieldtype": "Data", "width": 110},
    ]

    pkg_filters = {}
    if filters.get("packaging_item"):
        pkg_filters["name"] = filters["packaging_item"]

    pkg_items = frappe.get_all(
        "Packaging Item",
        filters=pkg_filters,
        fields=["name", "capacity", "current_stock"],
        order_by="packaging_item_name asc",
    )

    if not pkg_items:
        return columns, []

    pkg_names = [p.name for p in pkg_items]

    purchase_params = {"pkgs": pkg_names}
    purchase_date_clause = ""
    if start_date and end_date:
        purchase_date_clause = "AND date BETWEEN %(start)s AND %(end)s"
        purchase_params["start"] = start_date
        purchase_params["end"] = end_date

    purchase_rows = frappe.db.sql(
        f"""
        SELECT
            packaging_item,
            SUM(qty_purchased) AS qty,
            SUM(total_amount) AS cost
        FROM `tabPackaging Item Purchase`
        WHERE docstatus = 1
          AND packaging_item IN %(pkgs)s
          {purchase_date_clause}
        GROUP BY packaging_item
        """,
        purchase_params,
        as_dict=True,
    )
    purchase_map = {r.packaging_item: r for r in purchase_rows}

    usage_params = {"pkgs": pkg_names}
    usage_date_clause = ""
    if start_date and end_date:
        usage_date_clause = "AND pc.date BETWEEN %(start)s AND %(end)s"
        usage_params["start"] = start_date
        usage_params["end"] = end_date

    usage_rows = frappe.db.sql(
        f"""
        SELECT
            pli.packaging_item,
            SUM(pli.quantity) AS qty
        FROM `tabPackaging Collection Item` pli
        INNER JOIN `tabPackaging Collection` pc ON pc.name = pli.parent
        WHERE pc.docstatus = 1
          AND pli.packaging_item IN %(pkgs)s
          {usage_date_clause}
        GROUP BY pli.packaging_item
        """,
        usage_params,
        as_dict=True,
    )
    usage_map = {r.packaging_item: float(r.qty or 0) for r in usage_rows}

    low_stock_only = bool(filters.get("low_stock_only"))

    data = []
    for pkg in pkg_items:
        current_stock = float(pkg.current_stock or 0)

        if low_stock_only and current_stock >= LOW_STOCK_THRESHOLD:
            continue

        purchased = purchase_map.get(pkg.name)
        purchased_qty = float(purchased.qty) if purchased and purchased.qty else 0.0
        purchase_cost = float(purchased.cost) if purchased and purchased.cost else 0.0
        used_qty = usage_map.get(pkg.name, 0.0)

        if current_stock <= 0:
            stock_status = "Out of Stock"
        elif current_stock < LOW_STOCK_THRESHOLD:
            stock_status = "Low"
        else:
            stock_status = "OK"

        data.append({
            "packaging_item": pkg.name,
            "capacity": float(pkg.capacity or 0),
            "current_stock": current_stock,
            "purchased_qty": purchased_qty,
            "purchase_cost": purchase_cost,
            "used_qty": used_qty,
            "net_movement": purchased_qty - used_qty,
            "stock_status": stock_status,
        })

    return columns, data
