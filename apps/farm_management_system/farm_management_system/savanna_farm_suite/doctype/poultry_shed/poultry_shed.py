# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PoultryShed(Document):
	pass


@frappe.whitelist()
def get_block_logs(shed, limit=50):
	"""Recent Poultry Collections Table rows attributed to this block (shed)."""
	if not shed:
		return {"collections": [], "summary": {}}

	try:
		limit = max(1, min(int(limit), 500))
	except Exception:
		limit = 50

	rows = frappe.db.sql(
		"""
		SELECT
			pct.parent           AS batch,
			pct.date_of_collection AS date,
			pct.time_of_collection AS time,
			pct.milker           AS collector,
			COALESCE(emp.employee_name, pct.milker) AS collector_name,
			pct.product_collected AS product,
			pct.product_type     AS product_type,
			pct.quantity_collected AS quantity,
			pct.products_default_uom AS uom
		FROM `tabPoultry Collections Table` pct
		LEFT JOIN `tabEmployee` emp ON emp.name = pct.milker
		WHERE pct.parenttype = 'Poultry Batches'
		  AND pct.poultry_shed = %s
		ORDER BY pct.date_of_collection DESC, pct.time_of_collection DESC, pct.creation DESC
		LIMIT %s
		""",
		(shed, limit),
		as_dict=True,
	)

	# Block summary: total qty per product_type, chicken counts and parent batches.
	totals = {"Whole": 0.0, "Broken": 0.0, "Abnormal": 0.0, "Other": 0.0}
	for r in rows:
		key = r.get("product_type") if r.get("product_type") in totals else "Other"
		totals[key] += float(r.get("quantity") or 0)

	# Block-level chicken counts across batches
	count_rows = frappe.db.sql(
		"""
		SELECT pbb.parent AS batch, pb.batch_status, pbb.chicken_count
		FROM `tabPoultry Batch Blocks` pbb
		INNER JOIN `tabPoultry Batches` pb ON pb.name = pbb.parent
		WHERE pbb.parenttype = 'Poultry Batches'
		  AND pbb.poultry_shed = %s
		ORDER BY pb.modified DESC
		""",
		(shed,),
		as_dict=True,
	)
	active_chickens = sum(
		int(r.chicken_count or 0)
		for r in count_rows
		if (r.batch_status or "Active") == "Active"
	)
	active_batches = [r.batch for r in count_rows if (r.batch_status or "Active") == "Active"]

	# Format times to whole seconds for display
	for r in rows:
		t = r.get("time")
		if t and hasattr(t, "total_seconds"):
			total = int(t.total_seconds())
			hh, rem = divmod(total, 3600)
			mm, ss = divmod(rem, 60)
			r["time"] = f"{hh:02d}:{mm:02d}:{ss:02d}"
		d = r.get("date")
		if d and hasattr(d, "isoformat"):
			r["date"] = d.isoformat()

	return {
		"collections": rows,
		"summary": {
			"normal": totals["Whole"],
			"broken": totals["Broken"],
			"abnormal": totals["Abnormal"],
			"other": totals["Other"],
			"total": totals["Whole"] + totals["Broken"] + totals["Abnormal"] + totals["Other"],
			"active_chickens": active_chickens,
			"active_batches": active_batches,
		},
	}
