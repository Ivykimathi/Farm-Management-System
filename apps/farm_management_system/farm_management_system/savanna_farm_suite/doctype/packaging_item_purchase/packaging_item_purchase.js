// Copyright (c) 2026, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on('Packaging Item Purchase', {
	refresh(frm) {
		if (!frm.doc.warehouse) {
			frappe.db.get_single_value('Stock Settings', 'default_warehouse').then(w => {
				if (w && !frm.doc.warehouse) frm.set_value('warehouse', w);
			});
		}
	},

	packaging_item(frm) {
		if (!frm.doc.packaging_item) return;
		frappe.db.get_value('Packaging Item', frm.doc.packaging_item,
			['default_warehouse', 'purchase_rate', 'linked_item']).then(r => {
			const v = r.message || {};
			if (v.default_warehouse && !frm.doc.warehouse) frm.set_value('warehouse', v.default_warehouse);
			if (v.purchase_rate && !frm.doc.rate) frm.set_value('rate', v.purchase_rate);
			if (v.linked_item) frm.set_value('linked_item', v.linked_item);
		});
	},

	qty_purchased(frm) { compute_total(frm); },
	rate(frm) { compute_total(frm); }
});

function compute_total(frm) {
	const qty = frm.doc.qty_purchased || 0;
	const rate = frm.doc.rate || 0;
	frm.set_value('total_amount', qty * rate);
}
