frappe.pages['packaging-management'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Packaging Management',
		single_column: true
	});
	new PackagingManagementHub(page);
};

class PackagingManagementHub {
	constructor(page) {
		this.page = page;
		this.active_view = 'logs';
		this.render_shell();
		this.wire_controls();
		this.show_view(this.active_view);
	}

	render_shell() {
		const $body = $(this.page.body);
		$body.html(`
			<div class="pmh-wrap" style="padding: 8px 4px;">
				<p class="text-muted">Inspect packaging container stock or browse the full packaging-collection log.</p>

				<ul class="nav nav-pills pmh-tabs mb-3">
					<li class="nav-item">
						<a class="nav-link pmh-tab" data-view="logs" href="#">Packaging Collection Logs</a>
					</li>
					<li class="nav-item">
						<a class="nav-link pmh-tab" data-view="stock" href="#">Packaging Container Stock</a>
					</li>
				</ul>

				<div class="pmh-panel-logs pmh-panel">
					<div class="card pmh-card">
						<div class="card-header bg-secondary text-white d-flex justify-content-between align-items-center">
							<h6 class="mb-0">Packaging Collection Logs</h6>
							<small><span class="pmh-logs-count">0</span> shown</small>
						</div>
						<div class="card-body">
							<div class="row mb-3 align-items-end">
								<div class="col-md-2">
									<label class="small font-weight-bold mb-1">From</label>
									<input type="date" class="form-control form-control-sm pmh-from" />
								</div>
								<div class="col-md-2">
									<label class="small font-weight-bold mb-1">To</label>
									<input type="date" class="form-control form-control-sm pmh-to" />
								</div>
								<div class="col-md-2">
									<label class="small font-weight-bold mb-1">Status</label>
									<select class="form-control form-control-sm pmh-status">
										<option value="">Any</option>
										<option value="0">Draft</option>
										<option value="1">Submitted</option>
										<option value="2">Cancelled</option>
									</select>
								</div>
								<div class="col-md-2 pmh-collected-by"></div>
								<div class="col-md-2 pmh-pkg-item"></div>
								<div class="col-md-2 d-flex" style="padding-top: 22px;">
									<button class="btn btn-sm btn-primary mr-2 flex-fill pmh-apply"><i class="fa fa-search"></i> Apply</button>
									<button class="btn btn-sm btn-outline-secondary flex-fill pmh-clear">Clear</button>
								</div>
							</div>
							<div class="pmh-logs"></div>
						</div>
					</div>
				</div>

				<div class="pmh-panel-stock pmh-panel" style="display:none;">
					<div class="card pmh-card">
						<div class="card-header bg-secondary text-white">
							<h6 class="mb-0">Packaging Container Stock</h6>
						</div>
						<div class="card-body">
							<div class="pmh-pkg-stock"></div>
						</div>
					</div>
				</div>
			</div>

			<style>
				.pmh-card { border: none; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
				.pmh-card .card-header { border-bottom: 2px solid rgba(0,0,0,0.1); }
				.pmh-wrap .text-right { text-align: right; }
				.pmh-tabs .nav-link { cursor: pointer; }
			</style>
		`);

		this.collected_by_field = frappe.ui.form.make_control({
			parent: $body.find('.pmh-collected-by')[0],
			df: {
				fieldtype: 'Link', fieldname: 'collected_by',
				label: __('Packaged By'), options: 'Employee', placeholder: 'Any employee'
			},
			render_input: true
		});
		this.packaging_item_field = frappe.ui.form.make_control({
			parent: $body.find('.pmh-pkg-item')[0],
			df: {
				fieldtype: 'Link', fieldname: 'packaging_item',
				label: __('Packaging Item'), options: 'Packaging Item', placeholder: 'Any pack'
			},
			render_input: true
		});
	}

	wire_controls() {
		const $body = $(this.page.body);

		$body.find('.pmh-tab').on('click', (e) => {
			e.preventDefault();
			this.show_view($(e.currentTarget).data('view'));
		});

		$body.find('.pmh-apply').on('click', () => this.load_recent_collections());
		$body.find('.pmh-clear').on('click', () => {
			$body.find('.pmh-from').val('');
			$body.find('.pmh-to').val('');
			$body.find('.pmh-status').val('');
			this.collected_by_field.set_value('');
			this.packaging_item_field.set_value('');
			this.load_recent_collections();
		});
	}

	show_view(view) {
		this.active_view = view;
		const $body = $(this.page.body);
		$body.find('.pmh-tab').removeClass('active');
		$body.find(`.pmh-tab[data-view="${view}"]`).addClass('active');
		$body.find('.pmh-panel').hide();
		$body.find(`.pmh-panel-${view}`).show();

		if (view === 'logs') this.load_recent_collections();
		else if (view === 'stock') this.load_packaging_stock();
	}

	load_packaging_stock() {
		const $target = $(this.page.body).find('.pmh-pkg-stock');
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Packaging Item',
				fields: ['name', 'capacity', 'current_stock', 'default_uom'],
				limit_page_length: 200,
				order_by: 'packaging_item_name asc'
			},
			callback: (r) => {
				const rows = r.message || [];
				if (!rows.length) {
					$target.html('<p class="text-muted mb-0">No packaging items yet</p>');
					return;
				}
				let html = '<div class="table-responsive"><table class="table table-sm"><thead><tr>'
					+ '<th>Container</th><th class="text-right">Capacity</th><th class="text-right">Stock</th>'
					+ '</tr></thead><tbody>';
				rows.forEach(d => {
					const stock = d.current_stock || 0;
					const cls = stock > 0 ? 'text-success font-weight-bold' : 'text-danger font-weight-bold';
					html += '<tr>'
						+ '<td><a href="/app/packaging-item/' + encodeURIComponent(d.name) + '">' + frappe.utils.escape_html(d.name) + '</a></td>'
						+ '<td class="text-right">' + Number(d.capacity || 0).toFixed(0) + '</td>'
						+ '<td class="text-right ' + cls + '">' + Number(stock).toFixed(0) + '</td>'
						+ '</tr>';
				});
				html += '</tbody></table></div>';
				$target.html(html);
			}
		});
	}

	load_recent_collections() {
		const $body = $(this.page.body);
		const $target = $body.find('.pmh-logs');
		const $count = $body.find('.pmh-logs-count');
		const args = {
			date_from: $body.find('.pmh-from').val() || null,
			date_to: $body.find('.pmh-to').val() || null,
			status: $body.find('.pmh-status').val() || null,
			collected_by: this.collected_by_field.get_value() || null,
			packaging_item: this.packaging_item_field.get_value() || null,
			limit: 500
		};
		frappe.call({
			method: 'farm_management_system.savanna_farm_suite.doctype.packaging_collection.packaging_collection.get_packaging_collection_logs',
			args: args,
			callback: (r) => {
				const rows = r.message || [];
				$count.text(rows.length);
				if (!rows.length) {
					$target.html('<p class="text-muted mb-0">No packaging collections match these filters.</p>');
					return;
				}
				let html = '<div class="table-responsive"><table class="table table-sm table-hover"><thead><tr>'
					+ '<th>ID</th><th>Date</th><th>Time</th><th>Packaged By</th>'
					+ '<th>Warehouse</th><th>Packaging Items Used</th>'
					+ '<th class="text-right">Units</th><th>Status</th>'
					+ '</tr></thead><tbody>';
				rows.forEach(d => {
					const status = d.docstatus == 1 ? '<span class="badge badge-success">Submitted</span>'
						: d.docstatus == 2 ? '<span class="badge badge-danger">Cancelled</span>'
						: '<span class="badge badge-secondary">Draft</span>';
					const collector = d.collected_by_name
						? (d.collected_by_name + (d.collected_by_name !== d.collected_by ? ' (' + d.collected_by + ')' : ''))
						: (d.collected_by || '');
					html += '<tr>'
						+ '<td><a href="/app/packaging-collection/' + encodeURIComponent(d.name) + '">' + frappe.utils.escape_html(d.name) + '</a></td>'
						+ '<td>' + (d.date || '') + '</td>'
						+ '<td>' + (d.time || '') + '</td>'
						+ '<td>' + frappe.utils.escape_html(collector) + '</td>'
						+ '<td>' + frappe.utils.escape_html(d.warehouse || '') + '</td>'
						+ '<td><small>' + frappe.utils.escape_html(d.packaging_items_used || '') + '</small></td>'
						+ '<td class="text-right">' + Number(d.total_packed || 0).toFixed(0) + '</td>'
						+ '<td>' + status + '</td>'
						+ '</tr>';
				});
				html += '</tbody></table></div>';
				$target.html(html);
			}
		});
	}
}
