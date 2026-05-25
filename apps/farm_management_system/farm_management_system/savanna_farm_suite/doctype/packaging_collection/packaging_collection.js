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

		// Stock check: fetch current stock fresh and block selection of an out-of-stock item.
		frappe.db.get_value('Packaging Item', row.packaging_item, 'current_stock').then(sr => {
			const stock = (sr.message && sr.message.current_stock) || 0;
			frappe.model.set_value(cdt, cdn, 'current_stock', stock);

			if (stock <= 0) {
				const name = row.packaging_item;
				frappe.model.set_value(cdt, cdn, 'packaging_item', null);
				frappe.msgprint({
					title: __('Out of Stock'),
					indicator: 'red',
					message: __('{0} has no stock available. Replenish before adding it to a collection.', [name])
				});
				return;
			}

			// units_per_package: prefer the Packaging Item's attached_products row matching
			// the line's product; fall back to the Packaging Item's capacity.
			const apply_capacity_fallback = () => {
				frappe.db.get_value('Packaging Item', row.packaging_item, 'capacity').then(rr => {
					frappe.model.set_value(cdt, cdn, 'units_per_package', (rr.message || {}).capacity || 0);
					recalc_row(cdt, cdn, frm);
				});
			};

			if (row.product) {
				frappe.call({
					method: 'frappe.client.get_list',
					args: {
						doctype: 'Packaging Item Product',
						filters: { parent: row.packaging_item, product: row.product },
						fields: ['units_per_package'],
						parent: 'Packaging Item',
						limit_page_length: 1
					},
					callback: (r) => {
						const v = (r.message && r.message[0] && r.message[0].units_per_package) || null;
						if (v) {
							frappe.model.set_value(cdt, cdn, 'units_per_package', v);
							recalc_row(cdt, cdn, frm);
						} else {
							apply_capacity_fallback();
						}
					}
				});
			} else {
				apply_capacity_fallback();
			}
		});
	},

	quantity(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		const stock = row.current_stock || 0;
		if (row.packaging_item && row.quantity && row.quantity > stock) {
			const requested = row.quantity;
			const pkg = row.packaging_item;
			frappe.model.set_value(cdt, cdn, 'quantity', stock);
			frappe.msgprint({
				title: __('Not enough stock'),
				indicator: 'red',
				message: __('You asked for <b>{0}</b> packs of <b>{1}</b> but only <b>{2}</b> are in stock. Quantity reset to <b>{2}</b>.', [requested, pkg, stock])
			});
			return;
		}
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
