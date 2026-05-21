// Copyright (c) 2026, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Poultry Production Report"] = {
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
			"fieldname": "selection_mode",
			"label": __("Narrow By"),
			"fieldtype": "Select",
			"options": "All\nBatches\nBlocks",
			"default": "All",
			"reqd": 1,
			"on_change": function () {
				const mode = frappe.query_report.get_filter_value("selection_mode");
				const batch_filter = frappe.query_report.get_filter("poultry_batch");
				const block_filter = frappe.query_report.get_filter("poultry_block");

				if (batch_filter) batch_filter.toggle(mode === "Batches");
				if (block_filter) block_filter.toggle(mode === "Blocks");

				if (mode !== "Batches") frappe.query_report.set_filter_value("poultry_batch", "");
				if (mode !== "Blocks") frappe.query_report.set_filter_value("poultry_block", "");

				frappe.query_report.refresh();
			}
		},
		{
			"fieldname": "poultry_batch",
			"label": __("Specify Batch"),
			"fieldtype": "Link",
			"options": "Poultry Batches",
			"reqd": 0,
			"hidden": 1
		},
		{
			"fieldname": "poultry_block",
			"label": __("Specify Block"),
			"fieldtype": "Link",
			"options": "Poultry Shed",
			"reqd": 0,
			"hidden": 1
		},
		{
			"fieldname": "product",
			"label": __("Filter by Product"),
			"fieldtype": "Link",
			"options": "Animal Products",
			"reqd": 0
		},
		{
			"fieldname": "collector",
			"label": __("Filter by Collector"),
			"fieldtype": "Link",
			"options": "Employee",
			"reqd": 0
		}
	],

	"onload": function () {
		setTimeout(() => {
			const mode = frappe.query_report.get_filter_value("selection_mode") || "All";
			const batch_filter = frappe.query_report.get_filter("poultry_batch");
			const block_filter = frappe.query_report.get_filter("poultry_block");
			if (batch_filter) batch_filter.toggle(mode === "Batches");
			if (block_filter) block_filter.toggle(mode === "Blocks");
		}, 50);
	}
};
