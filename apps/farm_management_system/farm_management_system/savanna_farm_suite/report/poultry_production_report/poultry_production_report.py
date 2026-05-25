# Copyright (c) 2026, Techsavanna Technology and contributors
# For license information, please see license.txt

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

import frappe
from frappe.utils import getdate, today


TYPE_TO_COLUMN = {
    "Whole": "normal",
    "Broken": "broken",
    "Abnormal": "abnormal",
}


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


def _batches_for_block(block):
    """Return all Poultry Batch names that include the given shed/block (via Poultry
    Batch Blocks child table) plus the legacy single-link on Poultry Shed."""
    if not block:
        return []
    names = {
        row[0]
        for row in frappe.db.sql(
            """
            SELECT DISTINCT parent
            FROM `tabPoultry Batch Blocks`
            WHERE parenttype = 'Poultry Batches'
              AND poultry_shed = %s
            """,
            (block,),
        )
    }
    legacy = frappe.db.get_value("Poultry Shed", block, "poultry_batch")
    if legacy:
        names.add(legacy)
    return list(names)


def _blocks_for_batches(batch_names):
    """Return {batch_name: [block_name, ...]} from Poultry Batch Blocks."""
    if not batch_names:
        return {}
    rows = frappe.db.sql(
        """
        SELECT parent, poultry_shed
        FROM `tabPoultry Batch Blocks`
        WHERE parenttype = 'Poultry Batches'
          AND parent IN %(batches)s
          AND poultry_shed IS NOT NULL
        """,
        {"batches": tuple(batch_names)},
        as_dict=True,
    )
    out = defaultdict(list)
    for r in rows:
        if r.poultry_shed not in out[r.parent]:
            out[r.parent].append(r.poultry_shed)
    return out


def _format_time(time_val):
    if not time_val:
        return ""
    if hasattr(time_val, "total_seconds"):
        total = int(time_val.total_seconds())
        hh, rem = divmod(total, 3600)
        mm, ss = divmod(rem, 60)
        return f"{hh:02d}:{mm:02d}:{ss:02d}"
    return str(time_val)


def execute(filters=None):
    filters = filters or {}

    timeline = (filters.get("timeline") or "").strip() or "This Month"
    start_date, end_date = get_date_range_for_timeline(timeline)

    show_batch_col = (filters.get("selection_mode") or "All").strip() != "Blocks"

    columns = []
    if show_batch_col:
        columns.append({"label": "Batch", "fieldname": "batch", "fieldtype": "Link", "options": "Poultry Batches", "width": 170})
    columns += [
        {"label": "Block", "fieldname": "block", "fieldtype": "Data", "width": 160},
        {"label": "Date", "fieldname": "date", "fieldtype": "Date", "width": 110},
        {"label": "Time", "fieldname": "time", "fieldtype": "Data", "width": 90},
        {"label": "Collected By", "fieldname": "collector_name", "fieldtype": "Data", "width": 150},
        {"label": "Product", "fieldname": "product", "fieldtype": "Link", "options": "Animal Products", "width": 160},
        {"label": "Type", "fieldname": "type_label", "fieldtype": "Data", "width": 130},
        {"label": "Normal", "fieldname": "normal", "fieldtype": "Float", "width": 100},
        {"label": "Broken", "fieldname": "broken", "fieldtype": "Float", "width": 100},
        {"label": "Abnormal", "fieldname": "abnormal", "fieldtype": "Float", "width": 100},
        {"label": "Total", "fieldname": "total", "fieldtype": "Float", "width": 100},
        {"label": "UOM", "fieldname": "uom", "fieldtype": "Link", "options": "UOM", "width": 80},
    ]

    conditions = ["pct.date_of_collection BETWEEN %(start)s AND %(end)s"]
    params = {"start": start_date, "end": end_date}

    selection_mode = (filters.get("selection_mode") or "All").strip()
    selected_block = None

    if selection_mode == "Batches" and filters.get("poultry_batch"):
        conditions.append("pct.parent = %(poultry_batch)s")
        params["poultry_batch"] = filters["poultry_batch"]
    elif selection_mode == "Blocks" and filters.get("poultry_block"):
        selected_block = filters["poultry_block"]
        batches = _batches_for_block(selected_block)
        if not batches:
            return columns, []
        conditions.append("pct.parent IN %(batches)s")
        params["batches"] = tuple(batches)

    if filters.get("product"):
        conditions.append("pct.product_collected = %(product)s")
        params["product"] = filters["product"]
    if filters.get("collector"):
        conditions.append("pct.milker = %(collector)s")
        params["collector"] = filters["collector"]

    where_clause = " AND ".join(conditions)

    rows = frappe.db.sql(
        f"""
        SELECT
            pct.parent             AS batch,
            pct.date_of_collection AS date,
            pct.time_of_collection AS time,
            pct.milker             AS collector,
            pct.product_collected  AS product,
            pct.product_type       AS product_type,
            pct.quantity_collected AS quantity,
            pct.products_default_uom AS uom
        FROM `tabPoultry Collections Table` pct
        WHERE pct.parenttype = 'Poultry Batches'
          AND {where_clause}
        ORDER BY pct.date_of_collection DESC, pct.parent ASC, pct.time_of_collection ASC
        """,
        params,
        as_dict=True,
    )

    if not rows:
        return columns, []

    # Pivot: group by (batch, date, time, collector, product, uom); sum each type column.
    # Round time to whole seconds so sub-second drift across rows of one submission
    # (e.g. 11:16:17.233 vs .235) still groups together.
    def _whole_seconds(tv):
        if tv is None:
            return None
        if hasattr(tv, "total_seconds"):
            return timedelta(seconds=int(tv.total_seconds()))
        return tv

    pivot = {}
    for r in rows:
        key = (
            r.get("batch") or "",
            r.get("date"),
            _whole_seconds(r.get("time")),
            r.get("collector") or "",
            r.get("product") or "",
            r.get("uom") or "",
        )
        bucket = pivot.setdefault(key, {"normal": 0.0, "broken": 0.0, "abnormal": 0.0})
        col = TYPE_TO_COLUMN.get(r.get("product_type") or "")
        if col:
            bucket[col] += float(r.get("quantity") or 0)
        else:
            # 'Other' or unknown — bucket into Normal so it isn't lost
            bucket["normal"] += float(r.get("quantity") or 0)

    # Resolve collector employee names
    collector_ids = {k[3] for k in pivot if k[3]}
    collector_names = {}
    if collector_ids:
        for emp in frappe.get_all(
            "Employee",
            filters={"name": ["in", list(collector_ids)]},
            fields=["name", "employee_name"],
        ):
            collector_names[emp.name] = emp.employee_name or emp.name

    # Resolve blocks for each batch (skip when we already know the selected block)
    batch_names = {k[0] for k in pivot if k[0]}
    blocks_by_batch = {} if selected_block else _blocks_for_batches(batch_names)

    data = []
    daily_totals = defaultdict(lambda: {"normal": 0.0, "broken": 0.0, "abnormal": 0.0})
    grand = {"normal": 0.0, "broken": 0.0, "abnormal": 0.0}

    sorted_keys = sorted(pivot.keys(), key=lambda k: (k[1] or date.min, k[0], k[2] or timedelta(0)))
    for key in sorted_keys:
        batch, d, time_val, collector, product, uom = key
        bucket = pivot[key]
        normal = bucket["normal"]
        broken = bucket["broken"]
        abnormal = bucket["abnormal"]
        total = normal + broken + abnormal
        iso_d = d.isoformat() if hasattr(d, "isoformat") else (d or "")

        if selected_block:
            block_label = selected_block
        else:
            block_list = blocks_by_batch.get(batch, [])
            block_label = ", ".join(block_list)

        types_present = []
        if normal > 0:
            types_present.append("Whole")
        if broken > 0:
            types_present.append("Broken")
        if abnormal > 0:
            types_present.append("Abnormal")
        type_label = ", ".join(types_present)

        data.append({
            "batch": batch,
            "block": block_label,
            "date": iso_d,
            "time": _format_time(time_val),
            "collector_name": collector_names.get(collector, collector),
            "product": product,
            "type_label": type_label,
            "normal": normal,
            "broken": broken,
            "abnormal": abnormal,
            "total": total,
            "uom": uom,
        })

        dkey = (iso_d, product, uom)
        daily_totals[dkey]["normal"] += normal
        daily_totals[dkey]["broken"] += broken
        daily_totals[dkey]["abnormal"] += abnormal

        grand["normal"] += normal
        grand["broken"] += broken
        grand["abnormal"] += abnormal

    grand_total = grand["normal"] + grand["broken"] + grand["abnormal"]
    report_summary = [
        {"label": "Normal", "value": grand["normal"], "datatype": "Float", "indicator": "Green"},
        {"label": "Broken", "value": grand["broken"], "datatype": "Float", "indicator": "Red"},
        {"label": "Abnormal", "value": grand["abnormal"], "datatype": "Float", "indicator": "Orange"},
        {"label": "Total", "value": grand_total, "datatype": "Float", "indicator": "Blue"},
    ]

    return columns, data, None, None, report_summary
