// Copyright (c) 2026, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on('Packaging Item', {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__('Refresh Stock'), function () {
				frappe.call({
					method: 'farm_management_system.savanna_farm_suite.doctype.packaging_item.packaging_item.refresh_stock',
					args: { name: frm.doc.name },
					callback: function () { frm.reload_doc(); }
				});
			});

			if (frm.doc.linked_item) {
				frm.add_custom_button(__('Record Purchase'), function () {
					frappe.new_doc('Packaging Item Purchase', {
						packaging_item: frm.doc.name
					});
				});
			}
		}

		// Restrict the Attached Products → Product dropdown to farm products
		const grid = frm.fields_dict['attached_products'] && frm.fields_dict['attached_products'].grid;
		if (grid && grid.get_field('product')) {
			grid.get_field('product').get_query = function () {
				return {
					query: 'farm_management_system.savanna_farm_suite.doctype.packaging_item.packaging_item.get_farm_products'
				};
			};
		}
	}
});

frappe.ui.form.on('Packaging Item Product', {
	product(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		// Default units_per_package to packaging item capacity if not set
		if (!row.units_per_package && frm.doc.capacity) {
			frappe.model.set_value(cdt, cdn, 'units_per_package', frm.doc.capacity);
		}
	}
});
