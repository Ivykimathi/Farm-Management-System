// farm_management_system/savanna_farm_suite/doctype/sheep/sheep_list.js
frappe.listview_settings['Sheep'] = {
    refresh: function (list_view) {
        list_view.page.add_inner_button(__('Make Collection'), () => {
            const dialog = new frappe.ui.Dialog({
                title: __('Make a Collection of Animal Products'),
                fields: [
                    { fieldtype: 'Date', fieldname: 'date_of_collection', label: __('Date of Collection'), default: frappe.datetime.get_today(), reqd: 1 },
                    { fieldtype: 'Link', fieldname: 'animal', label: __('Specify Animal'), options: 'Animals', default: "Sheep", reqd: 1 },
                    { fieldtype: 'Check', fieldname: 'is_animal_specific', label: __('Is Animal Specific?'), default: 1 },
                    { fieldtype: 'Check', fieldname: 'is_shed_specific', label: __('Is Shed Specific?'), default: 0 },
                    { fieldtype: 'Link', fieldname: 'sheep', label: __('Specify Sheep'), options: 'Sheep', description: __('NOTE: Only Use for a single Sheep if Applicable.'), depends_on: 'eval:doc.is_animal_specific==1' },
                    { fieldtype: 'Link', fieldname: 'sheep_shed', label: __('Specify Sheep Shed'), options: 'Sheep Shed', description: __('Select a shed to collect for ALL sheep in it.'), depends_on: 'eval:doc.is_shed_specific==1' },
                    {
                        fieldtype: 'Table',
                        fieldname: 'production_table',
                        label: __('Collections Table'),
                        description: __('Use this table for <b>Multiple Entries</b>'),
                        depends_on: 'eval:doc.is_animal_specific==1',
                        fields: [
                            { fieldtype: 'Link', fieldname: 'sheep', label: __('Sheep'), options: 'Sheep', in_list_view: 1 },
                            { fieldtype: 'Data', fieldname: 'sheep_nickname', label: __('Nickname'), read_only: 1, in_list_view: 1 },
                            { fieldtype: 'Link', fieldname: 'animal_product', label: __('Animal Product'), options: 'Animal Products', reqd: 1, in_list_view: 1 },
                            { fieldtype: 'Data', fieldname: 'default_uom', label: __('Default UOM'), read_only: 1, in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'quantity_collected', label: __('Quantity Collected'), reqd: 1, in_list_view: 1 }
                        ]
                    },
                    {
                        fieldtype: 'Table',
                        fieldname: 'shed_production_table',
                        label: __('Shed Collections Table'),
                        description: __('Use this table for <b>Shed-based Entries</b>'),
                        depends_on: 'eval:doc.is_shed_specific==1',
                        fields: [
                            { fieldtype: 'Link', fieldname: 'sheep_shed', label: __('Sheep Shed'), options: 'Sheep Shed', in_list_view: 1 },
                            { fieldtype: 'Data', fieldname: 'shed_info', label: __('Shed Info'), read_only: 1, in_list_view: 1 },
                            { fieldtype: 'Link', fieldname: 'animal_product', label: __('Animal Product'), options: 'Animal Products', reqd: 1, in_list_view: 1 },
                            { fieldtype: 'Data', fieldname: 'default_uom', label: __('Default UOM'), read_only: 1, in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'quantity_collected', label: __('Quantity Collected'), reqd: 1, in_list_view: 1 }
                        ]
                    }
                ],
                primary_action_label: __('Make Entry'),
                primary_action: function () {
                    const dvalues = dialog.get_values(true);
                    const today = frappe.datetime.get_today();
                    const selected_date = dvalues && dvalues.date_of_collection;
                    if (selected_date && selected_date > today) {
                        frappe.show_alert({ message: __('Date of Collection cannot be a future date.'), indicator: 'orange' }, 5);
                        return;
                    }

                    const is_shed = dvalues.is_shed_specific;
                    const rows = is_shed ? (dvalues.shed_production_table || []) : (dvalues.production_table || []);
                    if (!rows.length) {
                        frappe.show_alert({ message: __('No products found to collect.'), indicator: 'orange' }, 5);
                        return;
                    }

                    frappe.warn(
                        __('Are you sure you want to proceed?'),
                        __('Please Note this Action is Irreversible'),
                        () => {
                            frappe.dom.freeze(__('Creating collection...'));
                            frappe.call({
                                method: 'farm_management_system.savanna_farm_suite.doctype.sheep.sheep.create_collection_entry',
                                args: {
                                    sheep: is_shed ? null : (dvalues.sheep || null),
                                    date_of_collection: dvalues.date_of_collection,
                                    rows: rows
                                },
                                callback: function (r) {
                                    frappe.dom.unfreeze();
                                    if (!r.exc && r.message) {
                                        // Play custom success sound
                                        var audio = new Audio('/assets/farm_management_system/sounds/success.mp3');
                                        audio.play().catch(function () { frappe.utils.play_sound('submit'); });
                                        dialog.hide();
                                        list_view.refresh();
                                        frappe.show_alert({ message: __('Collection recorded'), indicator: 'green' }, 5);
                                    } else if (r.exc) {
                                        // Play custom error sound
                                        var errAudio = new Audio('/assets/farm_management_system/sounds/sfx.mp3');
                                        errAudio.play().catch(function () { });
                                        const errMsg = (typeof r.exc === 'string') ? r.exc : (r._server_messages || r.exc || __('Unknown error occurred'));
                                        frappe.show_alert({ message: __('Error: ') + errMsg, indicator: 'red' }, 10);
                                    }
                                },
                                error: function () {
                                    frappe.dom.unfreeze();
                                    // Play custom error sound
                                    var errAudio = new Audio('/assets/farm_management_system/sounds/sfx.mp3');
                                    errAudio.play().catch(function () { });
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

            // ───── Mutual exclusion for checkboxes ─────
            dialog.fields_dict.is_animal_specific.$input.on('change', function () {
                if (dialog.get_value('is_animal_specific')) {
                    dialog.set_value('is_shed_specific', 0);
                }
            });
            dialog.fields_dict.is_shed_specific.$input.on('change', function () {
                if (dialog.get_value('is_shed_specific')) {
                    dialog.set_value('is_animal_specific', 0);
                }
            });

            // ───── Helper: apply per-row + top-level query so animal_product only shows products for selected animal ─────
            function set_product_query_for_animal(animal_name) {
                const get_query_fn = function () {
                    if (!animal_name) return { filters: {} };
                    return { filters: { product_tied_to_which_animal: animal_name } };
                };

                // Apply to animal-specific table
                _apply_product_query_to_table(dialog.fields_dict.production_table, get_query_fn);
                // Apply to shed-specific table
                _apply_product_query_to_table(dialog.fields_dict.shed_production_table, get_query_fn);
            }

            function _apply_product_query_to_table(tbl, get_query_fn) {
                if (!tbl || !tbl.grid) return;
                const grid = tbl.grid;

                try {
                    if (typeof grid.get_field === 'function') {
                        const topField = grid.get_field('animal_product');
                        if (topField) {
                            topField.get_query = get_query_fn;
                            if (topField.df) topField.df.get_query = get_query_fn;
                        }
                    }
                } catch (e) { console.warn('set_product_query top set failed', e); }

                try {
                    (grid.grid_rows || []).forEach(function (gr) {
                        try {
                            const f = gr.fields_map && gr.fields_map.animal_product;
                            if (f) {
                                f.get_query = get_query_fn;
                                if (f.df) f.df.get_query = get_query_fn;
                                if (gr.doc && gr.doc.animal_product) {
                                    gr.doc.animal_product = '';
                                    if (gr.refresh_field) gr.refresh_field('animal_product');
                                }
                            }
                        } catch (inner) { /* ignore per-row errors */ }
                    });
                } catch (e) { console.warn('set_product_query per-row set failed', e); }

                try { grid.refresh(); } catch (e) { }
            }

            // ───── Helper: populate rows for all active sheep (has_been_culled == 0) ─────
            function populate_rows_for_all_sheep() {
                const tbl = dialog.fields_dict.production_table;
                if (!tbl) return;
                const grid = tbl.grid;

                frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Sheep',
                        filters: { has_been_culled: 0 },
                        fields: ['name', 'add_nickname_optional'],
                        limit_page_length: 2000
                    },
                    callback: function (r) {
                        if (!r.message || !r.message.length) {
                            tbl.df.data = [];
                            if (tbl.grid) tbl.grid.refresh();
                            frappe.show_alert({ message: __('No active Sheep found'), indicator: 'orange' }, 5);
                            return;
                        }

                        const rows = r.message.map(c => ({
                            sheep: c.name,
                            sheep_nickname: c.add_nickname_optional || '',
                            animal_product: '',
                            default_uom: '',
                            quantity_collected: 0.0
                        }));

                        tbl.df.data = rows;
                        if (grid) grid.refresh();

                        try {
                            if (grid.grid_rows && grid.grid_rows.length) {
                                grid.grid_rows.forEach(function (gr) {
                                    try {
                                        if (gr.fields_map && gr.fields_map.sheep) {
                                            gr.fields_map.sheep.df.read_only = 1;
                                            gr.fields_map.sheep.$input && gr.fields_map.sheep.$input.prop('readonly', true);
                                        }
                                        if (gr.fields_map && gr.fields_map.sheep_nickname) {
                                            gr.fields_map.sheep_nickname.df.read_only = 1;
                                            gr.fields_map.sheep_nickname.$input && gr.fields_map.sheep_nickname.$input.prop('readonly', true);
                                        }
                                        gr.toggle_remove_button && gr.toggle_remove_button(false);
                                    } catch (e) { }
                                });
                            }
                            dialog.$wrapper.find('.grid-add-row, .grid-add-rows, .grid-row-add').hide();
                        } catch (e) {
                            console.warn('Could not lock child rows after sheep populate', e);
                        }

                        set_product_query_for_animal(dialog.get_value('animal'));
                    },
                    error: function () {
                        frappe.show_alert({ message: __('Failed to fetch Sheep'), indicator: 'red' }, 10);
                    }
                });
            }

            // ───── Helper: populate rows from list of Animal Products (one row per product) ─────
            function populate_rows_from_products_for_animal(animal) {
                const tbl = dialog.fields_dict.production_table;
                if (!tbl) return;
                const grid = tbl.grid;

                frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Animal Products',
                        filters: { product_tied_to_which_animal: animal },
                        fields: ['name', 'default_unit_of_measure'],
                        limit_page_length: 500
                    },
                    callback: function (r) {
                        if (!r.message || !r.message.length) {
                            tbl.df.data = [];
                            if (grid) grid.refresh();
                            frappe.show_alert({ message: __('No products found for selected animal'), indicator: 'orange' }, 5);
                            return;
                        }

                        const products = r.message;
                        const rows = products.map(p => ({
                            sheep: '',
                            sheep_nickname: '',
                            animal_product: p.name,
                            default_uom: p.default_unit_of_measure || '',
                            quantity_collected: 0.0
                        }));

                        tbl.df.data = rows;
                        if (grid) grid.refresh();

                        dialog.$wrapper.find('.grid-add-row, .grid-add-rows, .grid-row-add').show();
                        if (grid.grid_rows && grid.grid_rows.length) {
                            grid.grid_rows.forEach(function (gr) {
                                try {
                                    if (gr.fields_map && gr.fields_map.sheep) {
                                        gr.fields_map.sheep.df.read_only = 0;
                                        gr.fields_map.sheep.$input && gr.fields_map.sheep.$input.prop('readonly', false);
                                        gr.toggle_remove_button && gr.toggle_remove_button(true);
                                    }
                                    if (gr.fields_map && gr.fields_map.sheep_nickname) {
                                        gr.fields_map.sheep_nickname.df.read_only = 1;
                                        gr.fields_map.sheep_nickname.$input && gr.fields_map.sheep_nickname.$input.prop('readonly', true);
                                    }
                                } catch (e) { }
                            });
                        }

                        set_product_query_for_animal(animal);
                    },
                    error: function () {
                        frappe.show_alert({ message: __('Failed to fetch Animal Products'), indicator: 'red' }, 10);
                    }
                });
            }

            // ───── Helper: populate shed table rows from products ─────
            function populate_shed_rows_from_products(animal) {
                const tbl = dialog.fields_dict.shed_production_table;
                if (!tbl) return;
                const grid = tbl.grid;

                frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Animal Products',
                        filters: { product_tied_to_which_animal: animal },
                        fields: ['name', 'default_unit_of_measure'],
                        limit_page_length: 500
                    },
                    callback: function (r) {
                        if (!r.message || !r.message.length) {
                            tbl.df.data = [];
                            if (grid) grid.refresh();
                            frappe.show_alert({ message: __('No products found for selected animal'), indicator: 'orange' }, 5);
                            return;
                        }

                        const products = r.message;
                        const rows = products.map(p => ({
                            sheep_shed: '',
                            shed_info: '',
                            animal_product: p.name,
                            default_uom: p.default_unit_of_measure || '',
                            quantity_collected: 0.0
                        }));

                        tbl.df.data = rows;
                        if (grid) grid.refresh();

                        set_product_query_for_animal(animal);
                    },
                    error: function () {
                        frappe.show_alert({ message: __('Failed to fetch Animal Products'), indicator: 'red' }, 10);
                    }
                });
            }

            // ───── When animal changes ─────
            dialog.$wrapper.on('change', 'input[data-fieldname="animal"]', function () {
                const animal = $(this).val();
                set_product_query_for_animal(animal);

                const tbl = dialog.fields_dict.production_table;
                const shed_tbl = dialog.fields_dict.shed_production_table;

                const is_sheep_animal = ['Sheep'].includes(animal);
                const is_animal_specific = dialog.get_value('is_animal_specific');

                dialog.set_value('sheep', '');
                dialog.set_value('sheep_shed', '');

                if (!animal) {
                    if (tbl) { tbl.df.data = []; if (tbl.grid) tbl.grid.refresh(); }
                    if (shed_tbl) { shed_tbl.df.data = []; if (shed_tbl.grid) shed_tbl.grid.refresh(); }
                    return;
                }

                if (is_animal_specific) {
                    if (is_sheep_animal) {
                        populate_rows_for_all_sheep();
                    } else {
                        populate_rows_from_products_for_animal(animal);
                    }
                } else {
                    populate_shed_rows_from_products(animal);
                }
            });

            // ───── When checkbox modes change, repopulate accordingly ─────
            dialog.$wrapper.on('change', 'input[data-fieldname="is_animal_specific"], input[data-fieldname="is_shed_specific"]', function () {
                setTimeout(function () {
                    const animal = dialog.get_value('animal');
                    if (!animal) return;
                    const is_animal_specific = dialog.get_value('is_animal_specific');
                    const is_sheep_animal = ['Sheep'].includes(animal);

                    if (is_animal_specific) {
                        if (is_sheep_animal) {
                            populate_rows_for_all_sheep();
                        } else {
                            populate_rows_from_products_for_animal(animal);
                        }
                    } else {
                        populate_shed_rows_from_products(animal);
                    }
                }, 100);
            });

            // ───── If user selects a single sheep in the top-level sheep field ─────
            dialog.$wrapper.on('change', 'input[data-fieldname="sheep"]', function () {
                const selected_sheep = $(this).val();
                const animal = dialog.get_value('animal');
                if (!selected_sheep) return;
                if (!['Sheep'].includes(animal)) return;

                const tbl = dialog.fields_dict.production_table;
                if (!tbl) return;

                frappe.call({
                    method: 'frappe.client.get_value',
                    args: { doctype: 'Sheep', filters: { name: selected_sheep }, fieldname: 'add_nickname_optional' },
                    callback: function (r) {
                        const nick = (r && r.message && r.message.add_nickname_optional) || '';
                        tbl.df.data = [{
                            sheep: selected_sheep,
                            sheep_nickname: nick,
                            animal_product: '',
                            default_uom: '',
                            quantity_collected: 0.0
                        }];
                        if (tbl.grid) tbl.grid.refresh();

                        const grid = tbl.grid;
                        try {
                            if (grid.grid_rows && grid.grid_rows.length) {
                                const gr = grid.grid_rows[0];
                                if (gr && gr.fields_map && gr.fields_map.sheep) {
                                    gr.fields_map.sheep.df.read_only = 1;
                                    gr.fields_map.sheep.$input && gr.fields_map.sheep.$input.prop('readonly', true);
                                    gr.toggle_remove_button && gr.toggle_remove_button(false);
                                }
                                if (gr && gr.fields_map && gr.fields_map.sheep_nickname) {
                                    gr.fields_map.sheep_nickname.df.read_only = 1;
                                    gr.fields_map.sheep_nickname.$input && gr.fields_map.sheep_nickname.$input.prop('readonly', true);
                                }
                            }
                            dialog.$wrapper.find('.grid-add-row, .grid-add-rows, .grid-row-add').hide();
                        } catch (e) { console.warn('Could not lock single-sheep row', e); }

                        set_product_query_for_animal(animal);
                    },
                    error: function () {
                        frappe.show_alert({ message: __('Failed to fetch sheep nickname'), indicator: 'red' }, 10);
                    }
                });
            });

            // ───── When a sheep_shed is selected in the shed table OR top-level, auto-fill shed_info ─────
            dialog.$wrapper.on('change', 'input[data-fieldname="sheep_shed"]', function () {
                const $input = $(this);
                const val = $input.val();
                if (!val) return;

                // Check if this is the top-level shed field
                const $row = $input.closest('.grid-row');
                if (!$row.length) {
                    // Top-level sheep_shed selected — populate shed table with that shed
                    const tbl = dialog.fields_dict.shed_production_table;
                    if (!tbl) return;
                    frappe.call({
                        method: 'frappe.client.get_value',
                        args: { doctype: 'Sheep Shed', filters: { name: val }, fieldname: ['shed_description', 'current_animal_count'] },
                        callback: function (r) {
                            const desc = (r && r.message && r.message.shed_description) || '';
                            const count = (r && r.message && r.message.current_animal_count) || '';
                            const info = desc + ' (' + count + ')';

                            // Get current animal for products
                            const animal = dialog.get_value('animal');
                            frappe.call({
                                method: 'frappe.client.get_list',
                                args: {
                                    doctype: 'Animal Products',
                                    filters: { product_tied_to_which_animal: animal },
                                    fields: ['name', 'default_unit_of_measure'],
                                    limit_page_length: 500
                                },
                                callback: function (pr) {
                                    if (!pr.message || !pr.message.length) {
                                        tbl.df.data = [{ sheep_shed: val, shed_info: info, animal_product: '', default_uom: '', quantity_collected: 0.0 }];
                                        if (tbl.grid) tbl.grid.refresh();
                                        return;
                                    }
                                    const rows = pr.message.map(p => ({
                                        sheep_shed: val,
                                        shed_info: info,
                                        animal_product: p.name,
                                        default_uom: p.default_unit_of_measure || '',
                                        quantity_collected: 0.0
                                    }));
                                    tbl.df.data = rows;
                                    if (tbl.grid) tbl.grid.refresh();
                                    set_product_query_for_animal(animal);
                                }
                            });
                        }
                    });
                    return;
                }

                // In-table sheep_shed change — fill shed_info for that row
                const rowName = $row.attr('data-name');
                const tbl = dialog.fields_dict.shed_production_table;
                if (!tbl || !tbl.grid) return;
                const grid = tbl.grid;

                frappe.call({
                    method: 'frappe.client.get_value',
                    args: { doctype: 'Sheep Shed', filters: { name: val }, fieldname: ['shed_description', 'current_animal_count'] },
                    callback: function (r) {
                        const desc = (r && r.message && r.message.shed_description) || '';
                        const count = (r && r.message && r.message.current_animal_count) || '';
                        const info = desc + ' (' + count + ')';
                        try {
                            if (grid.grid_rows && grid.grid_rows.length) {
                                const gr = grid.grid_rows.find(function (rr) { return rr && rr.wrapper && rr.wrapper.attr && rr.wrapper.attr('data-name') === rowName; }) || grid.grid_rows[0];
                                if (gr && gr.doc) {
                                    gr.doc.shed_info = info;
                                    if (gr.refresh_field) gr.refresh_field('shed_info');
                                } else {
                                    grid.refresh();
                                }
                            } else {
                                grid.refresh();
                            }
                        } catch (e) { console.warn('set shed_info failed', e); }
                    }
                });
            });

            // ───── When an animal_product link is selected, auto-fill default_uom for that row ─────
            dialog.$wrapper.on('awesomplete-selectcomplete', 'input[data-fieldname="animal_product"]', function () {
                const $input = $(this);
                const val = $input.val();
                const $row = $input.closest('.grid-row');
                const rowName = $row.attr('data-name');

                // Determine which table this belongs to
                const is_shed_mode = dialog.get_value('is_shed_specific');
                const tbl = is_shed_mode ? dialog.fields_dict.shed_production_table : dialog.fields_dict.production_table;
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

            // ───── Newly added rows pick up the query for current animal ─────
            dialog.$wrapper.on('click', '.grid-add-row, .grid-add-rows, .grid-row-add', function () {
                setTimeout(function () {
                    const animal_val = dialog.get_value('animal');
                    set_product_query_for_animal(animal_val);
                }, 50);
            });

            // ───── Prevent future date on blur ─────
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

            // ───── Initialize default queries for initial animal value ─────
            set_product_query_for_animal(dialog.get_value('animal'));
            const initial_animal = dialog.get_value('animal');
            if (['Sheep'].includes(initial_animal)) {
                populate_rows_for_all_sheep();
            } else if (initial_animal) {
                populate_rows_from_products_for_animal(initial_animal);
            }

        }).addClass('btn-primary');

        // ═══════════════════════════════════════════════════════════════════════
        // ──────── "Cull Animal?" Button ────────
        // ═══════════════════════════════════════════════════════════════════════
        list_view.page.add_inner_button(__('Cull Animal?'), () => {
            const today = frappe.datetime.get_today();

            // Fetch all active Sheep (not culled)
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Sheep',
                    filters: { has_been_culled: 0 },
                    fields: ['name', 'add_nickname_optional', 'sheep_shed'],
                    limit_page_length: 2000
                },
                callback: function (r) {
                    const all_animals = (r && r.message) || [];
                    if (!all_animals.length) {
                        frappe.msgprint(__("No active Sheep found to cull."));
                        return;
                    }

                    // Build initial HTML table
                    function build_animal_table(animals) {
                        if (!animals.length) {
                            return '<p class="text-muted">' + __("No animals match the current filters.") + '</p>';
                        }
                        let html = '<table class="table table-bordered table-hover" style="margin-top:10px;">';
                        html += '<thead><tr>';
                        html += '<th style="width:40px;"><input type="checkbox" class="cull-select-all"></th>';
                        html += '<th>' + __("Animal ID") + '</th>';
                        html += '<th>' + __("Nickname") + '</th>';
                        html += '<th>' + __("Shed") + '</th>';
                        html += '</tr></thead><tbody>';
                        animals.forEach(a => {
                            html += '<tr>';
                            html += '<td><input type="checkbox" class="cull-animal-check" data-animal="' + a.name + '"></td>';
                            html += '<td>' + a.name + '</td>';
                            html += '<td>' + (a.add_nickname_optional || '-') + '</td>';
                            html += '<td>' + (a.sheep_shed || '-') + '</td>';
                            html += '</tr>';
                        });
                        html += '</tbody></table>';
                        return html;
                    }

                    const cull_dialog = new frappe.ui.Dialog({
                        title: __("Cull Animal"),
                        fields: [
                            {
                                fieldtype: 'Date',
                                fieldname: 'date_of_cull',
                                label: __('Date of Cull'),
                                default: today,
                                reqd: 1
                            },
                            { fieldtype: 'Column Break' },
                            {
                                fieldtype: 'Link',
                                fieldname: 'filter_shed',
                                label: __('Filter by Shed'),
                                options: 'Sheep Shed'
                            },
                            {
                                fieldtype: 'Link',
                                fieldname: 'filter_animal',
                                label: __('Filter by Specific Animal'),
                                options: 'Sheep',
                                get_query: function () {
                                    return { filters: { has_been_culled: 0 } };
                                }
                            },
                            { fieldtype: 'Section Break' },
                            {
                                fieldtype: 'HTML',
                                fieldname: 'animal_list_html',
                                label: __('Select Animals to Cull')
                            }
                        ],
                        size: 'large',
                        primary_action_label: __('Cull Selected'),
                        primary_action: function () {
                            const checked = cull_dialog.$wrapper.find('.cull-animal-check:checked');
                            if (!checked.length) {
                                frappe.msgprint(__("Please select at least one animal to cull."));
                                return;
                            }

                            const selected_animals = [];
                            checked.each(function () {
                                selected_animals.push($(this).data('animal'));
                            });

                            const date_val = cull_dialog.get_value('date_of_cull');

                            // ── Confirmation ──
                            frappe.confirm(
                                __("You are about to cull {0} animal(s). This action is IRREVERSIBLE and will also scrap any linked Assets. Are you sure?", [selected_animals.length]),
                                () => {
                                    frappe.call({
                                        method: 'farm_management_system.savanna_farm_suite.doctype.sheep.sheep.cull_animal',
                                        args: {
                                            animals: JSON.stringify(selected_animals),
                                            date_of_cull: date_val
                                        },
                                        freeze: true,
                                        freeze_message: __("Culling animals…"),
                                        callback: function (resp) {
                                            if (resp && !resp.exc) {
                                                try {
                                                    var audio = new Audio('/assets/farm_management_system/sounds/success.mp3');
                                                    audio.play();
                                                } catch (e) { }
                                                frappe.show_alert({ message: __("{0} animal(s) culled successfully", [selected_animals.length]), indicator: 'green' }, 5);
                                                cull_dialog.hide();
                                                list_view.refresh();
                                            } else {
                                                try {
                                                    var errAudio = new Audio('/assets/farm_management_system/sounds/sfx.mp3');
                                                    errAudio.play();
                                                } catch (e) { }
                                            }
                                        },
                                        error: function () {
                                            try {
                                                var errAudio = new Audio('/assets/farm_management_system/sounds/sfx.mp3');
                                                errAudio.play();
                                            } catch (e) { }
                                        }
                                    });
                                }
                            );
                        }
                    });

                    cull_dialog.show();
                    cull_dialog.$wrapper.find('.modal-dialog').css('max-width', '800px');

                    // Render initial table
                    const html_field = cull_dialog.fields_dict.animal_list_html;
                    html_field.$wrapper.html(build_animal_table(all_animals));

                    // Select-all checkbox
                    html_field.$wrapper.on('change', '.cull-select-all', function () {
                        const is_checked = $(this).prop('checked');
                        html_field.$wrapper.find('.cull-animal-check').prop('checked', is_checked);
                    });

                    // Filter logic
                    function apply_filters() {
                        const shed_val = cull_dialog.get_value('filter_shed');
                        const animal_val = cull_dialog.get_value('filter_animal');

                        let filtered = all_animals;
                        if (shed_val) {
                            filtered = filtered.filter(a => a.sheep_shed === shed_val);
                        }
                        if (animal_val) {
                            filtered = filtered.filter(a => a.name === animal_val);
                        }
                        html_field.$wrapper.html(build_animal_table(filtered));
                    }

                    cull_dialog.fields_dict.filter_shed.df.onchange = apply_filters;
                    cull_dialog.fields_dict.filter_animal.df.onchange = apply_filters;
                }
            });
        });
    }
};
