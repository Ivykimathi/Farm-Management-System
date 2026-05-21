// Copyright (c) 2026, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Packaging Item Stock and Usage"] = {
	"filters": [
		{
			"fieldname": "timeline",
			"label": __("Activity Timeline"),
			"fieldtype": "Select",
			"options": "\nThis Week\nLast Fortnight\nThis Month\nThis Quarter\nThis Year\nAll Time",
			"default": "This Month",
			"reqd": 1
		},
		{
			"fieldname": "packaging_item",
			"label": __("Filter by Packaging Item"),
			"fieldtype": "Link",
			"options": "Packaging Item",
			"reqd": 0
		},
		{
			"fieldname": "low_stock_only",
			"label": __("Low Stock Only (< 20)"),
			"fieldtype": "Check",
			"default": 0
		}
	]
};
