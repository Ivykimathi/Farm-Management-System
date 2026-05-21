// farm_management_system/public/js/poultry_batches_form.js
frappe.ui.form.on('Poultry Batches', {
    refresh: function (frm) {
        // Add the form button (styled like you requested)
        const $btn = frm.add_custom_button(__('Make Collection'), function () {
            const dialog = new frappe.ui.Dialog({
                title: __('Make Collection'),
                fields: [
                    { fieldtype: 'Date', fieldname: 'date_of_collection', label: __('Date of Collection'), default: frappe.datetime.get_today(), reqd: 1 },
                    { fieldtype: 'Link', fieldname: 'animal', label: __('Specify Animal'), options: 'Animals', default: frm.doc.animal || "Chicken", reqd: 1 },
                    {
                        fieldtype: 'Table',
                        fieldname: 'production_table',
                        label: __('Collections Table'),
                        fields: [
                            { fieldtype: 'Link', fieldname: 'poultry_batch', label: __('Poultry Batch'), options: 'Poultry Batches', in_list_view: 1 },
                            { fieldtype: 'Link', fieldname: 'animal_product', label: __('Animal Product'), options: 'Animal Products', reqd: 1, in_list_view: 1 },
                            { fieldtype: 'Data', fieldname: 'default_uom', label: __('Default UOM'), read_only: 1, in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'quantity_collected', label: __('Quantity Collected'), reqd: 1, in_list_view: 1 }
                        ]
                    }
                ],
                primary_action_label: __('Make Entry'),
                primary_action: function () {
                    const dvalues = dialog.get_values(true);

                    // Prevent future date
                    const selected_date = dvalues && dvalues.date_of_collection;
                    const today = frappe.datetime.get_today();
                    if (selected_date && selected_date > today) {
                        frappe.show_alert({ message: __('Date of Collection cannot be a future date.'), indicator: 'red' }, 5);
                        return;
                    }

                    const rows = dvalues.production_table || [];
                    if (!rows.length) {
                        frappe.show_alert({ message: __('No products found to collect.'), indicator: 'orange' }, 5);
                        return;
                    }

                    // Ensure only first row is considered (safety)
                    const single_row = rows[0];

                    frappe.warn(
                        __('Are you sure you want to proceed?'),
                        __('Please Note this Action is Irreversible'),
                        () => {
                            frappe.dom.freeze(__('Creating collection...'));
                            frappe.call({
                                method: 'farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.create_collection_entry',
                                args: {
                                    date_of_collection: dvalues.date_of_collection,
                                    rows: [single_row]
                                },
                                callback: function (r) {
                                    frappe.dom.unfreeze();
                                    if (!r.exc && r.message) {
                                        frappe.utils.play_sound('success');
                                        dialog.hide();
                                        frm.reload_doc && frm.reload_doc();
                                        frappe.show_alert({ message: __('Collection recorded'), indicator: 'green' });
                                    } else if (r.exc) {
                                        frappe.show_alert({ message: __('Error: ') + (r.exc || __('Unknown error occurred')), indicator: 'red' }, 10);
                                    }
                                },
                                error: function () {
                                    frappe.dom.unfreeze();
                                    frappe.show_alert({ message: __('Network Error: Please try again.'), indicator: 'red' }, 10);
                                }
                            });
                        },
                        'Continue',
                        true
                    );
                }
            });

            dialog.show();
            dialog.$wrapper.find('.modal-dialog').addClass('modal-lg');

            // Convenience references
            const tbl = dialog.fields_dict.production_table;
            if (!tbl) return;
            const grid = tbl.grid;

            // --- Populate a single row immediately; enforce poultry_batch = current doc's name ---
            const initial_row = {
                poultry_batch: frm.doc.name,
                animal_product: '',
                default_uom: '',
                quantity_collected: 0.0
            };

            // place the one row into the dialog's child table
            tbl.df.data = [initial_row];
            grid.refresh();

            // make the poultry_batch cell read-only and remove row add/remove UI
            try {
                // per-row adjustments
                if (grid.grid_rows && grid.grid_rows.length) {
                    const gr = grid.grid_rows[0];
                    // set the input value just to be safe
                    if (gr && gr.fields_map && gr.fields_map.poultry_batch) {
                        gr.fields_map.poultry_batch.df.read_only = 1;
                        // ensure input is read-only
                        try { gr.fields_map.poultry_batch.$input && gr.fields_map.poultry_batch.$input.prop('readonly', true); } catch (e) { }
                    }

                    // hide remove button for this row
                    try { gr.toggle_remove_button && gr.toggle_remove_button(false); } catch (e) { }
                }

                // hide global add-row buttons so no new rows can be added
                dialog.$wrapper.find('.grid-add-row, .grid-add-rows, .grid-row-add').hide();
            } catch (e) {
                console.warn('Could not lock child table to single row', e);
            }

            // When animal selection changes in dialog, filter animal_product; but preserve poultry_batch value
            // --- refined: set_product_query_for_animal + handlers ---
            function set_product_query_for_animal(animal_name) {
                const tbl = dialog.fields_dict.production_table;
                if (!tbl || !tbl.grid) return;
                const grid = tbl.grid;

                const get_query_fn = function () {
                    if (!animal_name) return { filters: {} };
                    return { filters: { product_tied_to_which_animal: animal_name } };
                };

                // 1) Apply to top-level grid field if available
                try {
                    if (typeof grid.get_field === 'function') {
                        const topField = grid.get_field('animal_product');
                        if (topField) {
                            topField.get_query = get_query_fn;
                            if (topField.df) topField.df.get_query = get_query_fn;
                        }
                    }
                } catch (e) {
                    console.warn('set_product_query_for_animal: top-level set failed', e);
                }

                // 2) Apply per-row (reliable)
                try {
                    (grid.grid_rows || []).forEach(function (gr) {
                        try {
                            const f = gr.fields_map && gr.fields_map.animal_product;
                            if (f) {
                                f.get_query = get_query_fn;
                                if (f.df) f.df.get_query = get_query_fn;

                                // If the animal changed, clear any product that might no longer be valid.
                                // This avoids showing wrong product values that don't match the selected animal.
                                if (gr.doc && gr.doc.animal_product) {
                                    // safest behaviour: clear product so user picks a valid one for the new animal
                                    gr.doc.animal_product = '';
                                    if (gr.refresh_field) gr.refresh_field('animal_product');
                                }
                            }
                        } catch (inner) { /* ignore per-row errors */ }
                    });
                } catch (e) {
                    console.warn('set_product_query_for_animal: per-row set failed', e);
                }

                // Finally refresh grid to ensure UI updates
                try { grid.refresh(); } catch (e) { /* ignore */ }
            }

            // attach change listener for animal field inside the dialog
            dialog.$wrapper.on('change', 'input[data-fieldname="animal"]', function () {
                const animal = $(this).val();

                // apply the query and clear any stale products
                set_product_query_for_animal(animal);

                // additional UX: if you want to pre-populate the single row's default_uom or
                // available products, you can fetch product list here and optionally fill a
                // small dropdown. For now we only ensure filtering and clearing stale values.
            });

            // When an animal_product link is chosen, auto-fill default_uom for that row
            dialog.$wrapper.on('awesomplete-selectcomplete', 'input[data-fieldname="animal_product"]', function () {
                const $input = $(this);
                const val = $input.val();
                // locate the row
                const $row = $input.closest('.grid-row');
                const rowName = $row.attr('data-name');
                const tbl = dialog.fields_dict.production_table;
                if (!tbl || !tbl.grid) return;
                const grid = tbl.grid;

                // call server for default_uom
                frappe.call({
                    method: 'frappe.client.get_value',
                    args: {
                        doctype: 'Animal Products',
                        filters: { name: val },
                        fieldname: 'default_unit_of_measure'
                    },
                    callback: function (r) {
                        const uom = (r && r.message && r.message.default_unit_of_measure) || '';
                        // find our row and set value
                        try {
                            if (grid.grid_rows && grid.grid_rows.length) {
                                // if single row, it's probably index 0
                                const gr = grid.grid_rows.find(function (rr) { return rr && rr.wrapper && rr.wrapper.attr && rr.wrapper.attr('data-name') === rowName; }) || grid.grid_rows[0];
                                if (gr && gr.doc) {
                                    gr.doc.default_uom = uom;
                                    if (gr.refresh_field) gr.refresh_field('default_uom');
                                } else {
                                    grid.refresh();
                                }
                            } else {
                                grid.refresh();
                            }
                        } catch (e) { console.warn('set default_uom failed', e); }
                    }
                });
            });


            // auto-fill default_uom when animal_product chosen
            dialog.$wrapper.on('awesomplete-selectcomplete', 'input[data-fieldname="animal_product"]', function () {
                const $input = $(this);
                const val = $input.val();
                const $row = $input.closest('.grid-row');
                const rowName = $row.attr('data-name');
                const gridRef = tbl.grid;
                if (!gridRef) return;
                frappe.call({
                    method: 'frappe.client.get_value',
                    args: { doctype: 'Animal Products', filters: { name: val }, fieldname: 'default_unit_of_measure' },
                    callback: function (r) {
                        const uom = (r && r.message && r.message.default_unit_of_measure) || '';
                        // find our single row and set default_uom
                        if (gridRef.grid_rows && gridRef.grid_rows.length) {
                            const gr = gridRef.grid_rows[0];
                            if (gr && gr.doc) {
                                gr.doc.default_uom = uom;
                                gr.refresh_field && gr.refresh_field('default_uom');
                            } else {
                                gridRef.refresh();
                            }
                        }
                    }
                });
            });

            // Prevent future date on blur
            dialog.$wrapper.on('blur', 'input[data-fieldname="date_of_collection"]', function () {
                const $input = $(this);
                const val = $input.val();
                if (!val) return;
                const today = frappe.datetime.get_today();
                if (val > today) {
                    frappe.show_alert({
                        message: __('Date of Collection cannot be a future date. The value has been reset to today.'),
                        indicator: 'orange'
                    }, 5);
                    dialog.set_value('date_of_collection', today);
                    $input.val(today);
                    try { $input.blur(); } catch (e) { }
                }
            });

        }).css({ "color": "white", "background-color": "#14141f", "font-weight": "800" }); // <- your requested style
    }
});
