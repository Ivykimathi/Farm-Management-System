// farm_management_system/public/js/poultry_batches_listview.js
frappe.listview_settings['Poultry Batches'] = {
    refresh: function (list_view) {
        // Add both actions under one grouped menu "Actions"
        // Use the third parameter (group) to place them together
        // Make Collection
        list_view.page.add_inner_button(__('Make Collection'), () => {
            const dialog = new frappe.ui.Dialog({
                title: __('Make Collection'),
                fields: [
                    {
                        fieldtype: 'Select',
                        fieldname: 'selection_mode',
                        label: __('Selection Mode'),
                        options: [
                            { label: __('Use Poultry Batch'), value: 'Batch' },
                            { label: __('Use Poultry Block'), value: 'Shed' }
                        ],
                        default: 'Batch'
                    },
                    {
                        fieldtype: 'Link',
                        fieldname: 'animal',
                        label: __('Specify Animal'),
                        options: 'Animals',
                        default: "Chicken",
                        depends_on: 'eval:doc.selection_mode == "Batch"',
                        reqd: 0 
                    },
                    {
                        fieldtype: 'Link',
                        fieldname: 'poultry_shed',
                        label: __('Specify Poultry Block'),
                        options: 'Poultry Shed',
                        depends_on: 'eval:doc.selection_mode == "Shed"',
                        onchange: function () {
                            const shed = this.get_value();
                            if (!shed) {
                                clear_production_table();
                                set_batch_query();
                                return;
                            }

                            frappe.db.get_value('Poultry Shed', shed, 'poultry_batch')
                                .then(r => {
                                    const batch = r && r.message && r.message.poultry_batch;
                                    set_batch_query_by_shed(shed);

                                    if (dialog.get_value('selection_mode') === 'Shed') {
                                        populate_rows_for_shed(batch, shed);
                                    }
                                });
                        }
                    },
                    {
                        fieldtype: 'Date',
                        fieldname: 'date_of_collection',
                        label: __('Date of Collection'),
                        default: frappe.datetime.get_today(),
                        reqd: 1
                    },
                    {
                        fieldtype: 'Table',
                        fieldname: 'production_table',
                        label: __('Collections Table'),
                        description: __('Use this table for <b>Multiple Entries</b>'),
                        depends_on: 'eval:doc.selection_mode=="Batch"',
                        fields: [
                            { fieldtype: 'Link', fieldname: 'poultry_batch', label: __('Poultry Batch'), options: 'Poultry Batches', in_list_view: 1, reqd: 1 },
                            { fieldtype: 'Link', fieldname: 'animal_product', label: __('Animal Product'), options: 'Animal Products', reqd: 1, in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'quantity_normal', label: __('Normal Quantity'), in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'quantity_broken', label: __('Broken Quantity'), in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'quantity_abnormal', label: __('Abnormal Quantity'), in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'quantity_total', label: __('Total Quantity'), read_only: 1, in_list_view: 1 }
                        ]
                    },
                    {
                        fieldtype: 'Table',
                        fieldname: 'shed_production_table',
                        label: __('Shed Collections Table'),
                        description: __('Use this table for <b>Shed-based Entries</b>'),
                        depends_on: 'eval:doc.selection_mode=="Shed"',
                        fields: [
                            { fieldtype: 'Link', fieldname: 'poultry_shed', label: __('Block'), options: 'Poultry Shed', reqd: 1, in_list_view: 1 },
                            { fieldtype: 'Link', fieldname: 'animal_product', label: __('Animal Product'), options: 'Animal Products', reqd: 1, in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'quantity_normal', label: __('Normal'), in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'quantity_broken', label: __('Broken'), in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'quantity_abnormal', label: __('Abnormal'), in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'quantity_total', label: __('Total'), read_only: 1, in_list_view: 1 }
                        ]
                    }
                ],
                primary_action_label: __('Make Entry'),
                primary_action: function () {
                    const dvalues = dialog.get_values(true);
                    const today = frappe.datetime.get_today();
                    const selected_date = dvalues && dvalues.date_of_collection;
                    if (selected_date && selected_date > today) {
                        frappe.show_alert({ message: __('Date of Collection cannot be a future date.'), indicator: 'red' }, 5);
                        return;
                    }

                    const rows = dvalues.selection_mode === 'Shed'
                        ? (dvalues.shed_production_table || [])
                        : (dvalues.production_table || []);

                    if (!rows.length) {
                        frappe.show_alert({ message: __('No products found to collect.'), indicator: 'orange' }, 5);
                        return;
                    }

                    if (dvalues.selection_mode === 'Shed' && !dvalues.poultry_shed) {
                        frappe.show_alert({ message: __('Please select a Poultry Shed for Shed mode.'), indicator: 'red' }, 5);
                        return;
                    }

                    const transformed_rows = [];
                    let has_valid_rows = false;

                    for (let row of rows) {
                        const normal_qty = getFloatValue(row.quantity_normal);
                        const broken_qty = getFloatValue(row.quantity_broken);
                        const abnormal_qty = getFloatValue(row.quantity_abnormal);
                        const total_qty = normal_qty + broken_qty + abnormal_qty;

                        if (total_qty <= 0) {
                            continue;
                        }

                        has_valid_rows = true;

                        if (!row.animal_product) {
                            frappe.show_alert({ message: __('Each row must include an Animal Product.'), indicator: 'red' }, 5);
                            return;
                        }

                       if (dvalues.selection_mode === 'Batch') {
                            const batch = row.poultry_batch;
                            if (!batch) {
                                frappe.show_alert({ message: __('Each row must include a Poultry Batch.'), indicator: 'red' }, 5);
                                return;
                            }
                        }

                        if (normal_qty > 0) {
                            transformed_rows.push({
                                poultry_batch: row.poultry_batch,
                                animal_product: row.animal_product,
                                default_uom: row.default_uom,
                                quantity_collected: normal_qty,
                                product_type: 'Whole'
                            });
                        }
                        if (broken_qty > 0) {
                            transformed_rows.push({
                                poultry_batch: row.poultry_batch,
                                animal_product: row.animal_product,
                                default_uom: row.default_uom,
                                quantity_collected: broken_qty,
                                product_type: 'Broken'
                            });
                        }
                        if (abnormal_qty > 0) {
                            transformed_rows.push({
                                poultry_batch: row.poultry_batch,
                                animal_product: row.animal_product,
                                default_uom: row.default_uom,
                                quantity_collected: abnormal_qty,
                                product_type: 'Abnormal'
                            });
                        }
                    }

                    if (!has_valid_rows) {
                        frappe.show_alert({ message: __('At least one row must have a quantity greater than 0.'), indicator: 'red' }, 5);
                        return;
                    }

                    const rows_to_send = transformed_rows;

                    frappe.warn(
                        __('Are you sure you want to proceed?'),
                        __('Please Note this Action is Irreversible'),
                        () => {
                            frappe.dom.freeze(__('Creating collection...'));
                            frappe.call({
                                method: 'farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.create_collection_entry',
                                args: {
                                    date_of_collection: dvalues.date_of_collection,
                                    selection_mode: dvalues.selection_mode,
                                    poultry_shed: dvalues.poultry_shed,
                                    rows: rows_to_send
                                },
                                callback: function (r) {
                                    frappe.dom.unfreeze();
                                    if (!r.exc && r.message) {
                                        frappe.utils.play_sound('success');
                                        dialog.hide();
                                        list_view.refresh();
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


            // Set specific styles for the Make Entry button to match request
            const primary_btn = dialog.get_primary_btn();
            if (primary_btn) {
                primary_btn.css({
                    'background-color': '#14141f',
                    'color': 'white',
                    'font-weight': '800'
                });
            }

            // ---------- Helpers ----------
            function get_tbl() {
                const mode = dialog.get_value && dialog.get_value('selection_mode');
                if (mode === 'Shed') {
                    return dialog.fields_dict && dialog.fields_dict.shed_production_table;
                }
                return dialog.fields_dict && dialog.fields_dict.production_table;
            }

            function getFloatValue(value) {
                const n = parseFloat(value);
                return isNaN(n) ? 0.0 : n;
            }

            function refresh_row_totals(table) {
                if (!table || !table.df || !Array.isArray(table.df.data)) return;
                table.df.data.forEach(function (row) {
                    row.quantity_normal = getFloatValue(row.quantity_normal);
                    row.quantity_broken = getFloatValue(row.quantity_broken);
                    row.quantity_abnormal = getFloatValue(row.quantity_abnormal);
                    row.quantity_total = row.quantity_normal + row.quantity_broken + row.quantity_abnormal;
                });
                if (table.grid && table.grid.grid_rows) {
                    table.grid.grid_rows.forEach(function (gr) {
                        if (gr.doc && gr.refresh_field) gr.refresh_field('quantity_total');
                    });
                }
            }

            function refresh_current_table_totals() {
                refresh_row_totals(get_tbl());
            }

            // Ensure animal_product choices are filtered by product_tied_to_which_animal
            function set_product_query_for_animal(animal_name) {
                const tbl = get_tbl();
                if (!tbl || !tbl.grid) return;
                const grid = tbl.grid;

                const get_query_fn = function () {
                    if (!animal_name) return { filters: {} };
                    return { filters: { product_tied_to_which_animal: animal_name } };
                };

                // Top-level grid field
                try {
                    const topField = grid.get_field('animal_product');
                    if (topField) {
                        topField.get_query = get_query_fn;
                        if (topField.df) topField.df.get_query = get_query_fn;
                    }
                } catch (e) { }

                // Per-row fields
                try {
                    (grid.grid_rows || []).forEach(function (gr) {
                        const f = gr.fields_map && gr.fields_map.animal_product;
                        if (f) {
                            f.get_query = get_query_fn;
                            if (f.df) f.df.get_query = get_query_fn;
                        }
                    });
                } catch (e) { }

                try { grid.refresh(); } catch (e) { }
            }

            // Set query for poultry_batch based on shed
            function set_batch_query_by_shed(shed_name) {
                const tbl = get_tbl();
                if (!tbl || !tbl.grid) return;
                const grid = tbl.grid;

                const get_query_fn = function () {
                    if (!shed_name) return { filters: { batch_status: "Active" } };
                    return {
                        query: "farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.get_batches_for_shed",
                        filters: { shed: shed_name }
                    };
                };

                // Apply query to the table field
                try {
                    const topField = grid.get_field('poultry_batch');
                    if (topField) {
                        topField.get_query = get_query_fn;
                    }
                    (grid.grid_rows || []).forEach(gr => {
                        const f = gr.fields_map && gr.fields_map.poultry_batch;
                        if (f) f.get_query = get_query_fn;
                    });
                } catch (e) { }
            }

            function get_shed_batch(shed_name) {
                if (!shed_name) return Promise.resolve('');
                return frappe.db.get_value('Poultry Shed', shed_name, 'poultry_batch')
                    .then(r => (r && r.message && r.message.poultry_batch) || '');
            }

            // Populate rows dynamically for normal, broken, and abnormal eggs
            function populate_rows_for_shed(batch_name, shed_name) {
                const tbl = get_tbl();
                if (!tbl || !tbl.grid) return;
                const grid = tbl.grid;

                if (!batch_name) {
                    clear_production_table();
                    frappe.show_alert({ message: __('Selected shed is not linked to an active batch.'), indicator: 'orange' }, 5);
                    return;
                }

                // Append a row for the selected shed and use separate quantity columns
                const rows = [
                    {
                        poultry_shed: shed_name,
                        poultry_batch: batch_name,
                        animal_product: 'Eggs',
                        default_uom: '',
                        quantity_normal: 0.0,
                        quantity_broken: 0.0,
                        quantity_abnormal: 0.0,
                        quantity_total: 0.0
                    }
                ];

                tbl.df.data = rows;
                grid.refresh();

                try {
                    (grid.grid_rows || []).forEach(function (gr) {
                        try {
                            gr.toggle_remove_button && gr.toggle_remove_button(false);
                            if(gr.fields_map) {
                                if(gr.fields_map.animal_product) gr.fields_map.animal_product.df.read_only = 1;
                                if(gr.fields_map.poultry_shed) gr.fields_map.poultry_shed.df.read_only = 1;
                                if(gr.fields_map.poultry_batch) gr.fields_map.poultry_batch.df.read_only = 1;
                            }
                        } catch (inner) { /* ignore */ }
                    });
                    dialog.$wrapper.find('.grid-add-row, .grid-add-rows, .grid-row-add').hide();
                } catch (e) {
                    console.warn('populate_rows_for_shed: could not lock rows', e);
                }

                refresh_current_table_totals();

                frappe.db.get_value('Animal Products', 'Eggs', 'default_unit_of_measure')
                    .then(r => {
                        const uom = (r && r.message && r.message.default_unit_of_measure) || '';
                        tbl.df.data.forEach(row => row.default_uom = uom);
                        grid.refresh();
                    }).catch(() => { });
            }

            function set_batch_query() {
                const tbl = get_tbl();
                if (!tbl || !tbl.grid) return;
                const grid = tbl.grid;

                const get_query_fn = function () {
                    return { filters: { batch_status: "Active" } };
                };

                try {
                    const topField = grid.get_field('poultry_batch');
                    if (topField) {
                        topField.get_query = get_query_fn;
                        if (topField.df) topField.df.get_query = get_query_fn;
                    }
                } catch (e) { console.warn('set_batch_query top set failed', e); }

                try {
                    (grid.grid_rows || []).forEach(function (gr) {
                        try {
                            const f = gr.fields_map && gr.fields_map.poultry_batch;
                            if (f) {
                                f.get_query = get_query_fn;
                                if (f.df) f.df.get_query = get_query_fn;
                            }
                        } catch (inner) { /* ignore per-row errors */ }
                    });
                } catch (e) { console.warn('set_batch_query per-row set failed', e); }

                try { grid.refresh(); } catch (e) { }
            }

            function clear_table(tbl) {
                if (!tbl) return;
                tbl.df.data = [];
                if (tbl.grid) tbl.grid.refresh();
            }

            function clear_production_table() {
                clear_table(dialog.fields_dict.production_table);
            }

            function clear_shed_production_table() {
                clear_table(dialog.fields_dict.shed_production_table);
            }

            function populate_rows_for_batches(batches) {
                const tbl = get_tbl();
                if (!tbl || !tbl.grid) return;
                const grid = tbl.grid;

                tbl.df.data = [];
                grid.refresh();

                const rows = batches.map(b => ({
                    poultry_batch: b.name,
                    animal_product: '',
                    default_uom: '',
                    quantity_normal: 0.0,
                    quantity_broken: 0.0,
                    quantity_abnormal: 0.0,
                    quantity_total: 0.0
                }));

                tbl.df.data = rows;
                grid.refresh();

                refresh_current_table_totals();

                // Lock poultry_batch per row and hide add/remove controls
                try {
                    (grid.grid_rows || []).forEach(function (gr) {
                        try {
                            if (gr.fields_map && gr.fields_map.poultry_batch) {
                                gr.fields_map.poultry_batch.df && (gr.fields_map.poultry_batch.df.read_only = 1);
                                try { gr.fields_map.poultry_batch.$input && gr.fields_map.poultry_batch.$input.prop('readonly', true); } catch (e) { }
                            }

                            // hide remove button for this row
                            gr.toggle_remove_button && gr.toggle_remove_button(false);
                        } catch (inner) { /* ignore */ }
                    });

                    // hide global add-row controls so user cannot add rows
                    dialog.$wrapper.find('.grid-add-row, .grid-add-rows, .grid-row-add').hide();
                } catch (e) {
                    console.warn('populate_rows_for_batches: could not lock rows', e);
                }

                set_product_query_for_animal(dialog.get_value('animal'));
                set_batch_query();
            }

            function populate_rows_for_products(products) {
                const tbl = get_tbl();
                if (!tbl || !tbl.grid) return;
                const grid = tbl.grid;

                tbl.df.data = [];
                grid.refresh();

                const rows = products.map(p => ({
                    poultry_batch: '',
                    animal_product: p.name,
                    default_uom: p.default_unit_of_measure || '',
                    quantity_normal: 0.0,
                    quantity_broken: 0.0,
                    quantity_abnormal: 0.0,
                    quantity_total: 0.0
                }));

                tbl.df.data = rows;
                grid.refresh();

                refresh_current_table_totals();

                try {
                    dialog.$wrapper.find('.grid-add-row, .grid-add-rows, .grid-row-add').show();
                    (grid.grid_rows || []).forEach(function (gr) {
                        try {
                            if (gr.fields_map && gr.fields_map.poultry_batch) {
                                gr.fields_map.poultry_batch.df && (gr.fields_map.poultry_batch.df.read_only = 0);
                                try { gr.fields_map.poultry_batch.$input && gr.fields_map.poultry_batch.$input.prop('readonly', false); } catch (e) { }
                                gr.toggle_remove_button && gr.toggle_remove_button(true);
                            }
                        } catch (inner) { /* ignore */ }
                    });
                } catch (e) {
                    console.warn('populate_rows_for_products: could not re-enable add/remove', e);
                }

                set_product_query_for_animal(dialog.get_value('animal'));
                set_batch_query();
            }

            // ---------- Events ----------

            // Initialize queries
            set_product_query_for_animal(null);
            set_batch_query();

            // Keep totals updated when quantity columns change
            dialog.$wrapper.on('change', 'input[data-fieldname="quantity_normal"], input[data-fieldname="quantity_broken"], input[data-fieldname="quantity_abnormal"]', function () {
                const $row = $(this).closest('.grid-row');
                const rowName = $row.attr('data-name');
                const tbl = get_tbl();
                if (!tbl || !tbl.grid) return;
                const gr = (tbl.grid.grid_rows || []).find(function (g) {
                    return g && g.wrapper && g.wrapper.attr && g.wrapper.attr('data-name') === rowName;
                });
                if (gr && gr.doc) {
                    gr.doc.quantity_normal = getFloatValue(gr.doc.quantity_normal);
                    gr.doc.quantity_broken = getFloatValue(gr.doc.quantity_broken);
                    gr.doc.quantity_abnormal = getFloatValue(gr.doc.quantity_abnormal);
                    gr.doc.quantity_total = gr.doc.quantity_normal + gr.doc.quantity_broken + gr.doc.quantity_abnormal;
                    gr.refresh_field && gr.refresh_field('quantity_total');
                }
            });

            // When animal changes
            dialog.$wrapper.on('change', 'input[data-fieldname="animal"]', function () {
                const animal = $(this).val();
                set_product_query_for_animal(animal);
                set_batch_query();

                const is_poultry = ['Chicken', 'Poultry', 'Birds'].includes(animal);
                clear_production_table();

                if (!animal) return;

                if (is_poultry) {
                    frappe.call({
                        method: 'frappe.client.get_list',
                        args: {
                            doctype: 'Poultry Batches',
                            filters: { batch_status: 'Active' },
                            fields: ['name'],
                            limit_page_length: 2000
                        },
                        callback: function (r) {
                            if (!r.message || !r.message.length) {
                                clear_production_table();
                                frappe.show_alert({ message: __('No active Poultry Batches found'), indicator: 'orange' });
                                return;
                            }
                            populate_rows_for_batches(r.message);
                        },
                        error: function () {
                            frappe.show_alert({ message: __('Failed to fetch Poultry Batches'), indicator: 'red' });
                        }
                    });
                } else {
                    frappe.call({
                        method: 'frappe.client.get_list',
                        args: {
                            doctype: 'Animal Products',
                            filters: { product_tied_to_which_animal: animal },
                            fields: ['name', 'default_unit_of_measure'],
                            limit_page_length: 1000
                        },
                        callback: function (r) {
                            if (!r.message || !r.message.length) {
                                clear_production_table();
                                frappe.show_alert({ message: __('No products found for selected animal'), indicator: 'orange' });
                                return;
                            }
                            populate_rows_for_products(r.message);
                        },
                        error: function () {
                            frappe.show_alert({ message: __('Failed to fetch Animal Products'), indicator: 'red' });
                        }
                    });
                }
            });

            // React to selection mode changes in the dialog
            dialog.$wrapper.on('change', 'input[data-fieldname="selection_mode"], select[data-fieldname="selection_mode"]', function () {
                const mode = $(this).val();
                const tbl = get_tbl();
                if (!tbl || !tbl.grid) return;

                if (mode === 'Shed') {
                    // Hide poultry batch dynamically in Shed (Block) Mode
                    tbl.grid.update_docfield_property('poultry_batch', 'hidden', 1);
                    tbl.grid.update_docfield_property('poultry_batch', 'in_list_view', 0);

                    clear_production_table();
                    clear_shed_production_table();
                    const shed = dialog.get_value('poultry_shed');
                    if (shed) {
                        frappe.db.get_value('Poultry Shed', shed, 'poultry_batch')
                            .then(r => {
                                const batch = r && r.message && r.message.poultry_batch;
                                populate_rows_for_shed(batch, shed);
                            });
                    }
                } else {
                    // Show poultry batch dynamically in Batch Mode
                    tbl.grid.update_docfield_property('poultry_batch', 'hidden', 0);
                    tbl.grid.update_docfield_property('poultry_batch', 'in_list_view', 1);
                    tbl.grid.update_docfield_property('poultry_shed', 'hidden', 1);
                    tbl.grid.update_docfield_property('poultry_shed', 'in_list_view', 0);

                    clear_production_table();
                    clear_shed_production_table();
                    const animal_field = dialog.$wrapper.find('input[data-fieldname="animal"]');
                    if (animal_field.length) {
                        animal_field.trigger('change');
                    }
                }
                
                tbl.grid.refresh();
            });

            // Auto-fill default_uom when product selected (awesomplete)
            dialog.$wrapper.on('awesomplete-selectcomplete', 'input[data-fieldname="animal_product"]', function () {
                const $input = $(this);
                const val = $input.val();
                const $row = $input.closest('.grid-row');
                const rowName = $row.attr('data-name');
                const tbl = get_tbl();
                if (!tbl || !tbl.grid) return;
                const grid = tbl.grid;

                frappe.call({
                    method: 'frappe.client.get_value',
                    args: { doctype: 'Animal Products', filters: { name: val }, fieldname: 'default_unit_of_measure' },
                    callback: function (r) {
                        const uom = (r && r.message && r.message.default_unit_of_measure) || '';
                        try {
                            if (grid.grid_rows && grid.grid_rows.length) {
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

            // When user adds a row manually later, ensure queries are applied to new row
            dialog.$wrapper.on('click', '.grid-add-row, .grid-add-rows, .grid-row-add', function () {
                setTimeout(function () {
                    const animal_val = dialog.get_value('animal');
                    set_product_query_for_animal(animal_val);
                    set_batch_query();
                }, 50);
            });

            // Prevent future date on blur
            dialog.$wrapper.on('blur', 'input[data-fieldname="date_of_collection"]', function () {
                const $input = $(this);
                const val = $input.val();
                if (!val) return;
                const today = frappe.datetime.get_today();
                if (val > today) {
                    frappe.show_alert({ message: __('Date of Collection cannot be a future date. The value has been reset to today.'), indicator: 'orange' }, 5);
                    dialog.set_value('date_of_collection', today);
                    $input.val(today);
                    try { $input.blur(); } catch (e) { }
                }
            });

            // initialize based on initial animal value
            const initial_animal = dialog.get_value('animal');
            if (['Chicken', 'Poultry', 'Birds'].includes(initial_animal)) {
                frappe.timeout(0).then(function () {
                    dialog.$wrapper.find('input[data-fieldname="animal"]').trigger('change');
                });
            } else if (initial_animal) {
                dialog.$wrapper.find('input[data-fieldname="animal"]').trigger('change');
            }

        }, __('Actions')).addClass('btn-primary');

        // Cull Animals (under same Actions group)
        list_view.page.add_inner_button(__('Cull Animals'), () => {
            const checked = list_view.get_checked_items();
            const default_batch = (Array.isArray(checked) && checked.length === 1) ? checked[0] : '';

            const cull_dialog = new frappe.ui.Dialog({
                title: __('Cull Animals'),
                fields: [
                    { fieldtype: 'Link', fieldname: 'poultry_batch', label: __('Specify Poultry Batch'), options: 'Poultry Batches', reqd: 1, default: default_batch },
                    { fieldtype: 'Int', fieldname: 'current_count', label: __('Current Poultry Count'), read_only: 1, description: __('Autopopulated') },
                    { fieldtype: 'Int', fieldname: 'count', label: __('Number of chickens to cull'), reqd: 1, description: __('Enter a positive whole number (no decimals)'), placeholder: __('e.g. 2, 30') }
                ],
                primary_action_label: __('Cull'),
                primary_action: function (values) {
                    const batch = values.poultry_batch;
                    const count = parseInt(values.count, 10);
                    const current = parseInt(values.current_count || 0, 10);

                    if (!batch) {
                        frappe.show_alert({ message: __('Please specify a Poultry Batch.'), indicator: 'red' }, 6);
                        return;
                    }
                    if (isNaN(count) || count <= 0) {
                        frappe.show_alert({ message: __('Please enter a positive whole number for the count.'), indicator: 'red' }, 6);
                        return;
                    }
                    if (isNaN(current) || current < 0) {
                        frappe.show_alert({ message: __('Current Poultry Count is unavailable. Please check the selected batch.'), indicator: 'red' }, 8);
                        return;
                    }
                    if (count > current) {
                        frappe.show_alert({ message: __('Cull count ({0}) exceeds current poultry count ({1}).', [count, current]), indicator: 'red' }, 8);
                        return;
                    }

                    cull_dialog.hide();

                    frappe.confirm(
                        __('This Action is irreversible! Do you want to continue?'),
                        () => {
                            frappe.dom.freeze(__('Applying cull...'));

                            frappe.call({
                                method: 'farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.cull_poultry_batch',
                                args: {
                                    batch_name: batch,
                                    cull_count: count
                                },
                                callback: function (r) {
                                    frappe.dom.unfreeze();
                                    if (r.message && r.message.success) {
                                        frappe.utils.play_sound('success');
                                        frappe.show_alert({
                                            message: __(
                                                'Cull applied. Batch: {0}. New mortality_count: {1}, mortality_rate: {2}%',
                                                [batch, r.message.mortality_count, (r.message.mortality_rate || 0).toFixed(3)]
                                            ),
                                            indicator: 'green'
                                        }, 8);
                                        list_view.refresh();
                                    } else {
                                        const err = (r.message && r.message.error) || (r.exc ? r.exc : __('Unknown error'));
                                        frappe.show_alert({
                                            message: __('Error: {0}', [err]),
                                            indicator: 'red'
                                        }, 10);
                                    }
                                },
                                error: function () {
                                    frappe.dom.unfreeze();
                                    frappe.show_alert({
                                        message: __('Failed to call server'),
                                        indicator: 'red'
                                    }, 10);
                                }
                            });
                        },
                        () => {}
                    );
                }
            });
            
            function fetchAndSetCurrentCount(batch_name) {
                if (!batch_name) {
                    cull_dialog.set_value('current_count', '');
                    return;
                }

                frappe.call({
                    method: 'frappe.client.get_value',
                    args: {
                        doctype: 'Poultry Batches',
                        filters: { name: batch_name },
                        fieldname: ['total_animals', 'mortality_count']
                    },
                    callback: function (r) {
                        if (!r || !r.message) {
                            cull_dialog.set_value('current_count', '');
                            frappe.show_alert({ message: __('Unable to fetch batch data.'), indicator: 'red' }, 6);
                            return;
                        }
                        const total = parseFloat(r.message.total_animals || 0);
                        const mort = parseFloat(r.message.mortality_count || 0);
                        let current = Math.max(0, Math.round(total - mort));
                        if (isNaN(current)) current = 0;
                        cull_dialog.set_value('current_count', current);
                    },
                    error: function () {
                        cull_dialog.set_value('current_count', '');
                        frappe.show_alert({ message: __('Network error fetching batch data.'), indicator: 'red' }, 8);
                    }
                });
            }

            cull_dialog.show();
            cull_dialog.$wrapper.find('.modal-dialog').addClass('modal-md');
            if (default_batch) {
                fetchAndSetCurrentCount(default_batch);
            }

            cull_dialog.$wrapper.on('change', 'input[data-fieldname="poultry_batch"]', function () {
                const batch = $(this).val();
                fetchAndSetCurrentCount(batch);
            });
            cull_dialog.$wrapper.on('awesomplete-selectcomplete', 'input[data-fieldname="poultry_batch"]', function () {
                const batch = $(this).val();
                fetchAndSetCurrentCount(batch);
            });

        }, __('Actions'));
    }
};