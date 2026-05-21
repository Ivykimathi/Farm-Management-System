// Copyright (c) 2026, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on('Packaging Collection', {
	refresh(frm) {
		if (!frm.doc.warehouse) {
			frappe.db.get_single_value('Stock Settings', 'default_warehouse').then(w => {
				if (w && !frm.doc.warehouse) frm.set_value('warehouse', w);
			});
		}

		const grid = frm.fields_dict['packaging_line_items'].grid;

		// Product dropdown: all stock items except backing items for packaging
		grid.get_field('product').get_query = function () {
			return {
				query: 'farm_management_system.savanna_farm_suite.doctype.packaging_collection.packaging_collection.get_products_filter'
			};
		};

	}
});

frappe.ui.form.on('Packaging Collection Item', {
	product(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		row.packaging_item = null;
		row.units_per_package = 0;
		row.linked_item = null;
		row.total_units = 0;
		row.current_stock = 0;
		frm.refresh_field('packaging_line_items');
	},

	packaging_item(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.packaging_item) return;

		// units_per_package: try Product Packaging Config, fall back to Packaging Item capacity
		if (row.product) {
			frappe.db.get_value('Product Packaging Config', {
				product: row.product,
				packaging_item: row.packaging_item
			}, 'units_per_package').then(r => {
				const v = (r.message && r.message.units_per_package) || null;
				if (v) {
					frappe.model.set_value(cdt, cdn, 'units_per_package', v);
					recalc_row(cdt, cdn, frm);
				} else {
					frappe.db.get_value('Packaging Item', row.packaging_item, 'capacity').then(rr => {
						frappe.model.set_value(cdt, cdn, 'units_per_package', (rr.message || {}).capacity || 0);
						recalc_row(cdt, cdn, frm);
					});
				}
			});
		} else {
			frappe.db.get_value('Packaging Item', row.packaging_item, 'capacity').then(rr => {
				frappe.model.set_value(cdt, cdn, 'units_per_package', (rr.message || {}).capacity || 0);
				recalc_row(cdt, cdn, frm);
			});
		}
	},

	quantity(frm, cdt, cdn) {
		recalc_row(cdt, cdn, frm);
	},

	units_per_package(frm, cdt, cdn) {
		recalc_row(cdt, cdn, frm);
	},

	packaging_line_items_remove(frm) {
		recalc_totals(frm);
	}
});

function recalc_row(cdt, cdn, frm) {
	const row = locals[cdt][cdn];
	const total = (row.quantity || 0) * (row.units_per_package || 0);
	frappe.model.set_value(cdt, cdn, 'total_units', total);
	recalc_totals(frm);
}

function recalc_totals(frm) {
	let total = 0;
	(frm.doc.packaging_line_items || []).forEach(l => {
		total += (l.quantity || 0) * (l.units_per_package || 0);
	});
	frm.set_value('total_packed', total);
}
