// Copyright (c) 2026, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Packaging Collection Summary"] = {
	"filters": [
		{
			"fieldname": "timeline",
			"label": __("Specify Timeline"),
			"fieldtype": "Select",
			"options": "\nThis Week\nLast Fortnight\nThis Month\nThis Quarter\nThis Year",
			"default": "This Month",
			"reqd": 1
		},
		{
			"fieldname": "product",
			"label": __("Filter by Product"),
			"fieldtype": "Link",
			"options": "Item",
			"reqd": 0
		},
		{
			"fieldname": "packaging_item",
			"label": __("Filter by Packaging Item"),
			"fieldtype": "Link",
			"options": "Packaging Item",
			"reqd": 0
		},
		{
			"fieldname": "warehouse",
			"label": __("Filter by Warehouse"),
			"fieldtype": "Link",
			"options": "Warehouse",
			"reqd": 0
		}
	]
};
