frappe.listview_settings['Poultry Shed'] = {
    refresh: function (list_view) {
        list_view.page.add_inner_button(__('Make Collection'), () => {
            const checked = list_view.get_checked_items() || [];
            const default_shed = (checked.length === 1) ? checked[0].name : '';
            open_collection_dialog(list_view, default_shed);
        }, __('Actions')).addClass('btn-primary');

        list_view.page.add_inner_button(__('Cull Animals'), () => {
            const checked = list_view.get_checked_items() || [];
            const default_shed = (checked.length === 1) ? checked[0].name : '';
            open_cull_dialog(list_view, default_shed);
        }, __('Actions'));
    }
};

function open_collection_dialog(list_view, default_shed) {
    const dialog = new frappe.ui.Dialog({
        title: __('Make Collection'),
        fields: [
            { fieldtype: 'Link', fieldname: 'poultry_shed', label: __('Block'), options: 'Poultry Shed', reqd: 1, default: default_shed },
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
            if (v.quantity_normal > 0) rows.push({ poultry_shed: v.poultry_shed, animal_product: v.animal_product, quantity_collected: v.quantity_normal, product_type: 'Whole' });
            if (v.quantity_broken > 0) rows.push({ poultry_shed: v.poultry_shed, animal_product: v.animal_product, quantity_collected: v.quantity_broken, product_type: 'Broken' });
            if (v.quantity_abnormal > 0) rows.push({ poultry_shed: v.poultry_shed, animal_product: v.animal_product, quantity_collected: v.quantity_abnormal, product_type: 'Abnormal' });

            frappe.dom.freeze(__('Recording collection...'));
            frappe.call({
                method: 'farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.create_collection_entry',
                args: {
                    date_of_collection: v.date_of_collection,
                    selection_mode: 'Shed',
                    poultry_shed: v.poultry_shed,
                    collected_by: v.collected_by,
                    rows: rows
                },
                callback: (r) => {
                    frappe.dom.unfreeze();
                    if (!r.exc) {
                        frappe.show_alert({ message: __('Collection recorded'), indicator: 'green' });
                        dialog.hide();
                        list_view.refresh();
                    }
                },
                error: () => frappe.dom.unfreeze()
            });
        }
    });
    dialog.show();
}

function open_cull_dialog(list_view, default_shed) {
    const dialog = new frappe.ui.Dialog({
        title: __('Cull Animals'),
        fields: [
            { fieldtype: 'Link', fieldname: 'poultry_shed', label: __('Block'), options: 'Poultry Shed', reqd: 1, default: default_shed },
            { fieldtype: 'Int', fieldname: 'available', label: __('Available in Block'), read_only: 1 },
            { fieldtype: 'Select', fieldname: 'poultry_batch', label: __('Batch'), options: '', reqd: 1, depends_on: 'eval:doc.poultry_shed', description: __('Select batch (auto-filled when block has one batch)') },
            { fieldtype: 'Int', fieldname: 'count', label: __('Number to cull'), reqd: 1 }
        ],
        primary_action_label: __('Cull'),
        primary_action: (v) => {
            const count = parseInt(v.count, 10);
            const available = parseInt(v.available || 0, 10);
            if (!v.poultry_shed) {
                frappe.show_alert({ message: __('Please select a Block.'), indicator: 'red' }, 5);
                return;
            }
            if (isNaN(count) || count <= 0) {
                frappe.show_alert({ message: __('Enter a positive whole number'), indicator: 'red' }, 5);
                return;
            }
            if (count > available) {
                frappe.show_alert({ message: __('Cull exceeds animals available in this block ({0})', [available]), indicator: 'red' }, 6);
                return;
            }
            if (!v.poultry_batch) {
                frappe.show_alert({ message: __('No active batch found for this block.'), indicator: 'red' }, 6);
                return;
            }
            frappe.confirm(__('This action is irreversible. Continue?'), () => {
                frappe.dom.freeze(__('Applying cull...'));
                frappe.call({
                    method: 'farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.cull_poultry_batch',
                    args: { batch_name: v.poultry_batch, cull_count: count, poultry_shed: v.poultry_shed },
                    callback: (r) => {
                        frappe.dom.unfreeze();
                        if (r.message && r.message.success) {
                            frappe.show_alert({ message: __('Cull applied'), indicator: 'green' });
                            dialog.hide();
                            list_view.refresh();
                        } else {
                            const err = (r.message && r.message.error) || __('Unknown error');
                            frappe.show_alert({ message: __('Error: {0}', [err]), indicator: 'red' }, 8);
                        }
                    },
                    error: () => frappe.dom.unfreeze()
                });
            });
        }
    });

    function load_shed_context(shed) {
        if (!shed) {
            dialog.set_value('available', 0);
            dialog.set_df_property('poultry_batch', 'options', '');
            dialog.set_value('poultry_batch', '');
            return;
        }
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Poultry Batch Blocks',
                parent: 'Poultry Batches',
                filters: { poultry_shed: shed },
                fields: ['parent', 'chicken_count'],
                limit_page_length: 50
            },
            callback: (r) => {
                const rows = r.message || [];
                const available = rows.reduce((s, d) => s + (parseInt(d.chicken_count, 10) || 0), 0);
                const batches = rows.map(d => d.parent).filter((v, i, a) => a.indexOf(v) === i);
                dialog.set_value('available', available);
                dialog.set_df_property('poultry_batch', 'options', batches.join('\n'));
                dialog.set_value('poultry_batch', batches[0] || '');
            }
        });
    }

    dialog.fields_dict.poultry_shed.df.onchange = () => load_shed_context(dialog.get_value('poultry_shed'));
    dialog.show();
    if (default_shed) load_shed_context(default_shed);
}
