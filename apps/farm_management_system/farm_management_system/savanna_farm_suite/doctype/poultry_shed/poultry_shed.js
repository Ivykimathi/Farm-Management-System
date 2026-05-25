// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on('Poultry Shed', {
	refresh(frm) {
		if (frm.is_new()) return;

		add_action_buttons(frm);
		load_block_logs(frm);
	}
});

function add_action_buttons(frm) {
	frm.add_custom_button(__('Make Collection'), () => open_block_collection_dialog(frm), __('Actions'));
	frm.add_custom_button(__('Cull Animals'), () => open_block_cull_dialog(frm), __('Actions'));
}

function load_block_logs(frm) {
	frappe.call({
		method: 'farm_management_system.savanna_farm_suite.doctype.poultry_shed.poultry_shed.get_block_logs',
		args: { shed: frm.doc.name, limit: 100 },
		callback: (r) => {
			const data = r.message || { collections: [], summary: {} };
			render_block_summary(frm, data.summary || {});
			render_block_collections(frm, data.collections || []);
		}
	});
}

function render_block_summary(frm, s) {
	const html = `
		<div class="row">
			<div class="col-md-3"><div class="indicator-card" style="border-left: 4px solid #28a745; padding: 8px 12px; background:#f7faf7;">
				<div class="small text-muted">Active Chickens</div>
				<div style="font-size: 1.4rem; font-weight: 700;">${Number(s.active_chickens || 0)}</div>
			</div></div>
			<div class="col-md-3"><div class="indicator-card" style="border-left: 4px solid #28a745; padding: 8px 12px; background:#f7faf7;">
				<div class="small text-muted">Normal Collected</div>
				<div style="font-size: 1.4rem; font-weight: 700;">${Number(s.normal || 0).toFixed(0)}</div>
			</div></div>
			<div class="col-md-3"><div class="indicator-card" style="border-left: 4px solid #dc3545; padding: 8px 12px; background:#fdf7f7;">
				<div class="small text-muted">Broken</div>
				<div style="font-size: 1.4rem; font-weight: 700;">${Number(s.broken || 0).toFixed(0)}</div>
			</div></div>
			<div class="col-md-3"><div class="indicator-card" style="border-left: 4px solid #fd7e14; padding: 8px 12px; background:#fdf9f5;">
				<div class="small text-muted">Abnormal</div>
				<div style="font-size: 1.4rem; font-weight: 700;">${Number(s.abnormal || 0).toFixed(0)}</div>
			</div></div>
		</div>
		<div class="small text-muted mt-2">Active batches at this block: ${(s.active_batches || []).join(', ') || '—'}</div>
	`;
	frm.set_df_property('block_summary_html', 'options', html);
	frm.refresh_field('block_summary_html');
}

function render_block_collections(frm, rows) {
	let html;
	if (!rows.length) {
		html = '<p class="text-muted mb-0">No collections recorded for this block yet. Use the <b>Make Collection</b> action.</p>';
	} else {
		html = '<div class="table-responsive"><table class="table table-sm table-hover"><thead><tr>'
			+ '<th>Batch</th><th>Date</th><th>Time</th><th>Collected By</th>'
			+ '<th>Product</th><th>Type</th><th class="text-right">Qty</th><th>UOM</th>'
			+ '</tr></thead><tbody>';
		rows.forEach(d => {
			html += '<tr>'
				+ '<td><a href="/app/poultry-batches/' + encodeURIComponent(d.batch || '') + '">' + (d.batch || '') + '</a></td>'
				+ '<td>' + (d.date || '') + '</td>'
				+ '<td>' + (d.time || '') + '</td>'
				+ '<td>' + (d.collector_name || d.collector || '') + '</td>'
				+ '<td>' + (d.product || '') + '</td>'
				+ '<td>' + (d.product_type || '') + '</td>'
				+ '<td class="text-right">' + Number(d.quantity || 0).toFixed(0) + '</td>'
				+ '<td>' + (d.uom || '') + '</td>'
				+ '</tr>';
		});
		html += '</tbody></table></div>';
	}
	frm.set_df_property('block_collections_html', 'options', html);
	frm.refresh_field('block_collections_html');
}

function open_block_collection_dialog(frm) {
	const dialog = new frappe.ui.Dialog({
		title: __('Make Collection — {0}', [frm.doc.name]),
		fields: [
			{ fieldtype: 'Date', fieldname: 'date_of_collection', label: __('Date of Collection'), default: frappe.datetime.get_today(), reqd: 1 },
			{ fieldtype: 'Link', fieldname: 'collected_by', label: __('Collected By'), options: 'Employee', reqd: 1 },
			{ fieldtype: 'Link', fieldname: 'animal_product', label: __('Animal Product'), options: 'Animal Products', reqd: 1, default: 'Eggs' },
			{ fieldtype: 'Float', fieldname: 'quantity_normal', label: __('Normal'), default: 0 },
			{ fieldtype: 'Float', fieldname: 'quantity_broken', label: __('Broken'), default: 0 },
			{ fieldtype: 'Float', fieldname: 'quantity_abnormal', label: __('Abnormal'), default: 0 }
		],
		primary_action_label: __('Make Entry'),
		primary_action: (v) => {
			const total = (parseFloat(v.quantity_normal) || 0)
				+ (parseFloat(v.quantity_broken) || 0)
				+ (parseFloat(v.quantity_abnormal) || 0);
			if (total <= 0) {
				frappe.show_alert({ message: __('Enter at least one quantity > 0'), indicator: 'orange' }, 5);
				return;
			}
			const rows = [];
			if (v.quantity_normal > 0) rows.push({ poultry_shed: frm.doc.name, animal_product: v.animal_product, quantity_collected: v.quantity_normal, product_type: 'Whole' });
			if (v.quantity_broken > 0) rows.push({ poultry_shed: frm.doc.name, animal_product: v.animal_product, quantity_collected: v.quantity_broken, product_type: 'Broken' });
			if (v.quantity_abnormal > 0) rows.push({ poultry_shed: frm.doc.name, animal_product: v.animal_product, quantity_collected: v.quantity_abnormal, product_type: 'Abnormal' });

			frappe.dom.freeze(__('Recording collection...'));
			frappe.call({
				method: 'farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.create_collection_entry',
				args: {
					date_of_collection: v.date_of_collection,
					selection_mode: 'Shed',
					poultry_shed: frm.doc.name,
					collected_by: v.collected_by,
					rows: rows
				},
				callback: (r) => {
					frappe.dom.unfreeze();
					if (!r.exc) {
						frappe.show_alert({ message: __('Collection recorded'), indicator: 'green' });
						dialog.hide();
						load_block_logs(frm);
					}
				},
				error: () => frappe.dom.unfreeze()
			});
		}
	});
	dialog.show();
}

function open_block_cull_dialog(frm) {
	// Find the active batch(es) this block belongs to so we can route the cull internally.
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Poultry Batch Blocks',
			parent: 'Poultry Batches',
			filters: { poultry_shed: frm.doc.name },
			fields: ['parent', 'chicken_count'],
			limit_page_length: 50
		},
		callback: (r) => {
			const rows = r.message || [];
			if (!rows.length) {
				frappe.show_alert({ message: __('This block is not linked to any batch yet.'), indicator: 'orange' }, 6);
				return;
			}
			const batch_options = rows.map(d => d.parent).filter((v, i, a) => a.indexOf(v) === i);
			const block_available = rows.reduce((sum, d) => sum + (parseInt(d.chicken_count, 10) || 0), 0);

			const fields = [
				{ fieldtype: 'Data', fieldname: 'poultry_shed', label: __('Block'), default: frm.doc.name, read_only: 1 },
				{ fieldtype: 'Int', fieldname: 'count', label: __('Number to cull'), reqd: 1, description: __('Available in this block: {0}', [block_available]) }
			];
			if (batch_options.length > 1) {
				fields.splice(1, 0, { fieldtype: 'Select', fieldname: 'poultry_batch', label: __('Batch (this block belongs to more than one)'), options: batch_options.join('\n'), reqd: 1, default: batch_options[0] });
			}

			const dialog = new frappe.ui.Dialog({
				title: __('Cull Animals — {0}', [frm.doc.name]),
				fields: fields,
				primary_action_label: __('Cull'),
				primary_action: (v) => {
					const count = parseInt(v.count, 10);
					if (isNaN(count) || count <= 0) {
						frappe.show_alert({ message: __('Enter a positive whole number'), indicator: 'red' }, 5);
						return;
					}
					if (count > block_available) {
						frappe.show_alert({ message: __('Cull exceeds animals available in this block ({0})', [block_available]), indicator: 'red' }, 6);
						return;
					}
					const batch_name = v.poultry_batch || batch_options[0];
					frappe.confirm(__('This action is irreversible. Continue?'), () => {
						frappe.dom.freeze(__('Applying cull...'));
						frappe.call({
							method: 'farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.cull_poultry_batch',
							args: { batch_name: batch_name, cull_count: count, poultry_shed: frm.doc.name },
							callback: (r2) => {
								frappe.dom.unfreeze();
								if (r2.message && r2.message.success) {
									frappe.show_alert({ message: __('Cull applied'), indicator: 'green' });
									dialog.hide();
									frm.reload_doc();
									load_block_logs(frm);
								}
							},
							error: () => frappe.dom.unfreeze()
						});
					});
				}
			});
			dialog.show();
		}
	});
}
