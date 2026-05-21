frappe.pages['sell-packaged-products'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Sell Packaged Products',
		single_column: true
	});

	new SellPackagedProductsPage(page);
};

class SellPackagedProductsPage {
	constructor(page) {
		this.page = page;
		this.items = [];
		this.render_shell();
		this.bind_controls();
		this.load_default_warehouse();
	}

	render_shell() {
		const $body = $(this.page.body);
		$body.html(`
			<div class="spp-wrap" style="padding: 12px 4px;">
				<p class="text-muted">Pick packaged trays from stock, set customer and quantity, then post a Sales Invoice or Delivery Note in one click.</p>

				<div class="row">
					<div class="col-md-8 mb-3">
						<div class="card spp-card">
							<div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
								<h6 class="mb-0">Available Packs</h6>
								<small>Filtered to items in the Packaged Products group</small>
							</div>
							<div class="card-body">
								<div class="row mb-3">
									<div class="col-md-6">
										<label class="small font-weight-bold">Warehouse</label>
										<div class="spp-warehouse-control"></div>
										<small class="text-muted">Leave blank to use the company default</small>
									</div>
									<div class="col-md-6 text-right" style="align-self: flex-end;">
										<button class="btn btn-sm btn-outline-secondary spp-refresh">
											<i class="fa fa-sync"></i> Refresh Stock
										</button>
									</div>
								</div>
								<div class="spp-items-table"></div>
							</div>
						</div>
					</div>

					<div class="col-md-4 mb-3">
						<div class="card spp-card">
							<div class="card-header bg-primary text-white">
								<h6 class="mb-0">Sale Details</h6>
							</div>
							<div class="card-body">
								<div class="form-group">
									<label class="small font-weight-bold">Document Type</label>
									<select class="form-control form-control-sm spp-doc-type">
										<option value="Sales Invoice">Sales Invoice (bill now)</option>
										<option value="Delivery Note">Delivery Note (deliver, bill later)</option>
									</select>
								</div>

								<div class="form-group">
									<label class="small font-weight-bold">Customer <span class="text-danger">*</span></label>
									<div class="spp-customer-control"></div>
								</div>

								<div class="form-group">
									<label class="small font-weight-bold">Posting Date</label>
									<div class="spp-date-control"></div>
								</div>

								<div class="form-group">
									<label class="small font-weight-bold">Notes (optional)</label>
									<textarea class="form-control form-control-sm spp-notes" rows="2" placeholder="Internal remarks"></textarea>
								</div>

								<div class="mt-3 text-right">
									<div class="mb-2 small text-muted">
										<span class="spp-selected-count">0</span> rows selected &middot;
										Total: <span class="spp-total">0.00</span>
									</div>
									<button class="btn btn-success btn-block spp-submit">
										<i class="fa fa-check"></i> Create &amp; Submit
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		`);

		this.$items_target = $body.find('.spp-items-table');
		this.$selected_count = $body.find('.spp-selected-count');
		this.$total = $body.find('.spp-total');

		this.customer_field = frappe.ui.form.make_control({
			parent: $body.find('.spp-customer-control')[0],
			df: { fieldtype: 'Link', fieldname: 'customer', options: 'Customer', placeholder: 'Pick a customer' },
			render_input: true
		});

		this.warehouse_field = frappe.ui.form.make_control({
			parent: $body.find('.spp-warehouse-control')[0],
			df: {
				fieldtype: 'Link', fieldname: 'warehouse', options: 'Warehouse',
				placeholder: 'Default warehouse',
				get_query: () => ({ filters: { is_group: 0, disabled: 0 } }),
				onchange: () => this.load_items()
			},
			render_input: true
		});

		this.date_field = frappe.ui.form.make_control({
			parent: $body.find('.spp-date-control')[0],
			df: { fieldtype: 'Date', fieldname: 'posting_date', default: frappe.datetime.get_today() },
			render_input: true
		});
		this.date_field.set_value(frappe.datetime.get_today());
	}

	bind_controls() {
		const $body = $(this.page.body);
		$body.on('click', '.spp-refresh', () => this.load_items());
		$body.on('click', '.spp-submit', () => this.submit_sale());
		$body.on('input', '.spp-qty, .spp-rate', () => this.update_totals());
	}

	load_default_warehouse() {
		frappe.call({
			method: 'farm_management_system.savanna_farm_suite.page.sell_packaged_products.sell_packaged_products.get_default_warehouse',
			callback: (r) => {
				if (r.message) this.warehouse_field.set_value(r.message);
				this.load_items();
			}
		});
	}

	load_items() {
		const wh = (this.warehouse_field.get_value() || '').trim() || null;
		frappe.call({
			method: 'farm_management_system.savanna_farm_suite.page.sell_packaged_products.sell_packaged_products.get_available_packaged_items',
			args: { warehouse: wh },
			callback: (r) => {
				this.items = r.message || [];
				this.render_items();
			}
		});
	}

	render_items() {
		if (!this.items.length) {
			this.$items_target.html('<p class="text-muted mb-0">No packaged products available. Submit a Packaging Collection first.</p>');
			this.update_totals();
			return;
		}
		let html = '<table class="table table-sm table-bordered"><thead><tr>'
			+ '<th>Packaged Item</th>'
			+ '<th class="text-right">In Stock</th>'
			+ '<th style="width: 110px;">Qty</th>'
			+ '<th style="width: 130px;">Rate</th>'
			+ '<th class="text-right">Line Total</th>'
			+ '</tr></thead><tbody>';
		this.items.forEach((d, idx) => {
			const lowStock = (d.current_stock || 0) <= 0;
			html += '<tr data-idx="' + idx + '">'
				+ '<td>' + frappe.utils.escape_html(d.item_name || d.item_code) + '<br><small class="text-muted">' + frappe.utils.escape_html(d.item_code) + '</small></td>'
				+ '<td class="text-right ' + (lowStock ? 'text-danger font-weight-bold' : '') + '">' + Number(d.current_stock || 0).toFixed(0) + ' ' + frappe.utils.escape_html(d.uom || '') + '</td>'
				+ '<td><input type="number" min="0" step="1" class="form-control form-control-sm spp-qty" /></td>'
				+ '<td><input type="number" min="0" step="0.01" class="form-control form-control-sm spp-rate" value="' + Number(d.default_rate || 0).toFixed(2) + '" /></td>'
				+ '<td class="text-right spp-line-total">0.00</td>'
				+ '</tr>';
		});
		html += '</tbody></table>';
		this.$items_target.html(html);
		this.update_totals();
	}

	get_selected_rows() {
		const rows = [];
		const items = this.items;
		this.$items_target.find('tr[data-idx]').each(function() {
			const idx = parseInt($(this).attr('data-idx'));
			const qty = parseFloat($(this).find('.spp-qty').val()) || 0;
			const rate = parseFloat($(this).find('.spp-rate').val()) || 0;
			if (qty > 0) {
				rows.push({ item_code: items[idx].item_code, qty: qty, rate: rate });
			}
		});
		return rows;
	}

	update_totals() {
		let count = 0, total = 0;
		this.$items_target.find('tr[data-idx]').each(function() {
			const qty = parseFloat($(this).find('.spp-qty').val()) || 0;
			const rate = parseFloat($(this).find('.spp-rate').val()) || 0;
			const line = qty * rate;
			$(this).find('.spp-line-total').text(line.toFixed(2));
			if (qty > 0) { count += 1; total += line; }
		});
		this.$selected_count.text(count);
		this.$total.text(total.toFixed(2));
	}

	submit_sale() {
		const $body = $(this.page.body);
		const customer = this.customer_field.get_value();
		const doc_type = $body.find('.spp-doc-type').val();
		const warehouse = this.warehouse_field.get_value() || null;
		const posting_date = this.date_field.get_value() || null;
		const notes = $body.find('.spp-notes').val() || null;
		const rows = this.get_selected_rows();

		if (!customer) {
			frappe.show_alert({ message: 'Select a customer first', indicator: 'red' }, 5);
			return;
		}
		if (!rows.length) {
			frappe.show_alert({ message: 'Enter quantity on at least one row', indicator: 'orange' }, 5);
			return;
		}

		frappe.confirm(
			'Create and submit ' + doc_type + ' for ' + rows.length + ' line(s)?',
			() => {
				frappe.dom.freeze('Creating ' + doc_type + '...');
				frappe.call({
					method: 'farm_management_system.savanna_farm_suite.page.sell_packaged_products.sell_packaged_products.create_packaged_sale',
					args: { customer, doc_type, items: rows, warehouse, posting_date, notes },
					callback: (r) => {
						frappe.dom.unfreeze();
						if (r.message && r.message.name) {
							frappe.show_alert({ message: doc_type + ' ' + r.message.name + ' submitted', indicator: 'green' }, 7);
							frappe.set_route('Form', r.message.doctype, r.message.name);
						}
					},
					error: () => frappe.dom.unfreeze()
				});
			}
		);
	}
}
