// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Poultry Shed", {
    refresh(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('Make Collection'), () => {
                const shed_name = frm.doc.name;
                const batch_name = frm.doc.poultry_batch;

                if (!batch_name) {
                    frappe.msgprint({
                        title: __('Missing Batch'),
                        message: __('This shed is not linked to any Poultry Batch. Please link a batch first.'),
                        indicator: 'orange'
                    });
                    return;
                }

                // Verify batch is active before showing dialog
                frappe.db.get_value('Poultry Batches', batch_name, 'batch_status')
                    .then(r => {
                        const status = r && r.message && r.message.batch_status;
                        if (status !== 'Active') {
                            frappe.msgprint({
                                title: __('Batch Inactive'),
                                message: __('The linked batch {0} is currently <b>{1}</b>. Collections can only be made for Active batches.', [batch_name, status]),
                                indicator: 'red'
                            });
                            return;
                        }
                        open_collection_dialog(frm);
                    });
            }, __('Actions'));

            // Style the button
            frm.page.set_inner_button_style(__('Make Collection'), __('Actions'), 'primary');
            const btn = frm.page.get_inner_button(__('Make Collection'), __('Actions'));
            if (btn) {
                btn.css({
                    'background-color': '#14141f',
                    'color': 'white',
                    'font-weight': '800'
                });
            }
        }
    },
});

function open_collection_dialog(frm) {
    const dialog = new frappe.ui.Dialog({
        title: __('Make Collection for {0}', [frm.doc.name]),
        fields: [
            {
                fieldtype: 'Date',
                fieldname: 'date_of_collection',
                label: __('Date of Collection'),
                default: frappe.datetime.get_today(),
                reqd: 1
            },
            {
                fieldtype: 'Link',
                fieldname: 'poultry_batch',
                label: __('Poultry Batch'),
                options: 'Poultry Batches',
                default: frm.doc.poultry_batch,
                read_only: 1
            },
            {
                fieldtype: 'Table',
                fieldname: 'production_table',
                label: __('Collections Table'),
                fields: [
                    { fieldtype: 'Link', fieldname: 'animal_product', label: __('Animal Product'), options: 'Animal Products', reqd: 1, in_list_view: 1 },
                    { fieldtype: 'Data', fieldname: 'default_uom', label: __('Default UOM'), read_only: 1, in_list_view: 1 },
                    { fieldtype: 'Float', fieldname: 'quantity_collected', label: __('Quantity Collected'), reqd: 1, in_list_view: 1 }
                ]
            }
        ],
        primary_action_label: __('Make Entry'),
        primary_action: function () {
            const dvalues = dialog.get_values(true);
            if (!dvalues) return;

            const rows = (dvalues.production_table || []).map(r => {
                r.poultry_batch = dvalues.poultry_batch;
                return r;
            });

            if (!rows.length) {
                frappe.show_alert({ message: __('No products found to collect.'), indicator: 'orange' });
                return;
            }

            frappe.confirm(
                __('Are you sure you want to proceed? This Action is Irreversible.'),
                () => {
                    frappe.dom.freeze(__('Creating collection...'));
                    frappe.call({
                        method: 'farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.create_collection_entry',
                        args: {
                            date_of_collection: dvalues.date_of_collection,
                            rows: rows
                        },
                        callback: function (r) {
                            frappe.dom.unfreeze();
                            if (!r.exc && r.message) {
                                frappe.utils.play_sound('success');
                                dialog.hide();
                                frappe.show_alert({ message: __('Collection recorded'), indicator: 'green' });
                            } else if (r.exc) {
                                frappe.msgprint({ title: __('Error'), message: r.exc, indicator: 'red' });
                            }
                        },
                        error: () => {
                            frappe.dom.unfreeze();
                        }
                    });
                }
            );
        }
    });

    dialog.show();
    dialog.$wrapper.find('.modal-dialog').addClass('modal-lg');

    // Filter products for Chicken (assume chicken for poultry shed)
    const tbl = dialog.fields_dict.production_table;
    if (tbl) {
        const grid = tbl.grid;
        const get_query_fn = () => { return { filters: { product_tied_to_which_animal: 'Chicken' } }; };

        try {
            const product_field = grid.get_field('animal_product');
            if (product_field) product_field.get_query = get_query_fn;
        } catch (e) { }

        (grid.grid_rows || []).forEach(gr => {
            if (gr.fields_map.animal_product) gr.fields_map.animal_product.get_query = get_query_fn;
        });
    }

    // Auto-fill UOM
    dialog.$wrapper.on('awesomplete-selectcomplete', 'input[data-fieldname="animal_product"]', function () {
        const val = $(this).val();
        const rowName = $(this).closest('.grid-row').attr('data-name');
        if (!val) return;

        frappe.db.get_value('Animal Products', val, 'default_unit_of_measure').then(r => {
            const uom = r.message && r.message.default_unit_of_measure;
            const tbl = dialog.fields_dict.production_table;
            if (tbl && tbl.grid) {
                const row = tbl.grid.grid_rows.find(rr => rr.wrapper.attr('data-name') === rowName);
                if (row && row.doc) {
                    row.doc.default_uom = uom || '';
                    row.refresh_field('default_uom');
                }
            }
        });
    });
}
