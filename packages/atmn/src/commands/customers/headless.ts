/**
 * Headless mode for the customers command.
 * Provides structured output (text/json/csv) for AI/programmatic interaction.
 */

import { AppEnv } from "../../lib/env/detect.js";
import { createCustomersController } from "../../lib/headless/index.js";
import type { ApiCustomer } from "../../lib/api/endpoints/customers.js";
import type { ApiCustomerExpanded } from "../../views/react/customers/types.js";
import { formatError } from "../../lib/api/client.js";

export interface HeadlessCustomersOptions {
	/** Environment (sandbox/live) */
	prod?: boolean;
	/** Page number */
	page?: number;
	/** Search query */
	search?: string;
	/** Get specific customer by ID */
	id?: string;
	/** Items per page */
	limit?: number;
	/** Output format */
	format?: "text" | "json" | "csv";
}

/**
 * Execute a headless customers command
 */
export async function headlessCustomersCommand(
	options: HeadlessCustomersOptions,
): Promise<void> {
	const environment = options.prod ? AppEnv.Live : AppEnv.Sandbox;
	const format = options.format ?? "text";
	const page = options.page ?? 1;
	const limit = options.limit ?? 50;

	try {
		// Create controller
		const controller = await createCustomersController(environment, {
			pageSize: limit,
			initialPage: page,
			initialSearch: options.search,
		});

		// If --id is specified, fetch and output that specific customer
		if (options.id) {
			const expanded = await controller.getExpandedItem(options.id);
			if (!expanded) {
				throw new Error(`Customer not found: ${options.id}`);
			}
			outputSingleCustomer(expanded, format);
			return;
		}

		// Otherwise output the list
		outputCustomerList(controller.getItems(), controller.getPagination(), format, options.search);
	} catch (error) {
		const message = formatError(error);

		if (format === "json") {
			const apiError = error as { status?: number; response?: unknown };
			console.log(
				JSON.stringify(
					{
						error: error instanceof Error ? error.message : String(error),
						status: apiError.status,
						details: apiError.response,
					},
					null,
					2,
				),
			);
		} else {
			console.error(`Error: ${message}`);
		}

		process.exit(1);
	}
}

/**
 * Output a list of customers
 */
function outputCustomerList(
	customers: ApiCustomer[],
	pagination: { page: number; pageSize: number; hasMore: boolean },
	format: "text" | "json" | "csv",
	search?: string,
): void {
	if (format === "json") {
		console.log(
			JSON.stringify(
				{
					customers,
					pagination: {
						page: pagination.page,
						pageSize: pagination.pageSize,
						hasMore: pagination.hasMore,
						count: customers.length,
					},
					search: search ?? null,
				},
				null,
				2,
			),
		);
		return;
	}

	if (format === "csv") {
		// CSV header
		console.log("id,name,email,created_at,env,stripe_id");
		// CSV rows
		for (const c of customers) {
			const name = escapeCsv(c.name ?? "");
			const email = escapeCsv(c.email ?? "");
			const created = new Date(c.created_at * 1000).toISOString();
			const stripeId = c.stripe_id ?? "";
			console.log(`${c.id},${name},${email},${created},${c.env},${stripeId}`);
		}
		return;
	}

	// Text format
	const envLabel = customers[0]?.env === "live" ? "live" : "sandbox";
	console.log(`Customers (${envLabel}) - Page ${pagination.page}${pagination.hasMore ? " (more available)" : " (last page)"}`);
	
	if (search) {
		console.log(`Search: "${search}"`);
	}
	
	console.log("");

	if (customers.length === 0) {
		console.log("No customers found.");
		return;
	}

	// Calculate column widths
	const idWidth = Math.max(2, ...customers.map((c) => c.id.length));
	const nameWidth = Math.max(4, ...customers.map((c) => (c.name ?? "-").length));
	const emailWidth = Math.max(5, ...customers.map((c) => (c.email ?? "-").length));

	// Header
	console.log(
		`${"ID".padEnd(idWidth)}  ${"Name".padEnd(nameWidth)}  ${"Email".padEnd(emailWidth)}  Created`,
	);
	console.log("-".repeat(idWidth + nameWidth + emailWidth + 30));

	// Rows
	for (const c of customers) {
		const name = (c.name ?? "-").padEnd(nameWidth);
		const email = (c.email ?? "-").padEnd(emailWidth);
		const created = formatDate(c.created_at);
		console.log(`${c.id.padEnd(idWidth)}  ${name}  ${email}  ${created}`);
	}

	console.log("");
	console.log(`${customers.length} customers shown.`);
}

/**
 * Output a single customer with expanded details
 */
function outputSingleCustomer(
	customer: ApiCustomerExpanded,
	format: "text" | "json" | "csv",
): void {
	if (format === "json") {
		console.log(JSON.stringify(customer, null, 2));
		return;
	}

	if (format === "csv") {
		// For single customer, just output basic fields as CSV
		console.log("id,name,email,created_at,env,stripe_id");
		const name = escapeCsv(customer.name ?? "");
		const email = escapeCsv(customer.email ?? "");
		const created = new Date(customer.created_at * 1000).toISOString();
		const stripeId = customer.stripe_id ?? "";
		console.log(`${customer.id},${name},${email},${created},${customer.env},${stripeId}`);
		return;
	}

	// Text format - detailed view
	console.log(`Customer: ${customer.id}`);
	console.log("=".repeat(50));
	console.log("");

	console.log("Basic Info:");
	console.log(`  Name:       ${customer.name ?? "-"}`);
	console.log(`  Email:      ${customer.email ?? "-"}`);
	console.log(`  Environment: ${customer.env}`);
	console.log(`  Created:    ${formatDate(customer.created_at)}`);
	if (customer.stripe_id) {
		console.log(`  Stripe ID:  ${customer.stripe_id}`);
	}

	// Subscriptions
	if (customer.subscriptions?.length) {
		console.log("");
		console.log("Subscriptions:");
		for (const sub of customer.subscriptions) {
			const planName = sub.plan?.name ?? sub.plan_id ?? "Unknown";
			const status = sub.status ?? "active";
			console.log(`  - ${planName} (${status})`);
		}
	}

	// Balances
	const balances = customer.balances ? Object.values(customer.balances) : [];
	if (balances.length) {
		console.log("");
		console.log("Feature Balances:");
		for (const balance of balances) {
			const featureName = balance.feature?.name ?? balance.feature_id;
			if (balance.unlimited) {
				console.log(`  - ${featureName}: Unlimited`);
			} else if (balance.feature?.type !== "boolean") {
				const used = balance.usage;
				const total = balance.current_balance;
				console.log(`  - ${featureName}: ${used}/${total} used`);
			} else {
				console.log(`  - ${featureName}: ON`);
			}
		}
	}

	// Invoices
	if (customer.invoices?.length) {
		console.log("");
		console.log(`Invoices (${customer.invoices.length}):`);
		for (const inv of customer.invoices.slice(0, 5)) {
			const amount = inv.total ? `$${(inv.total / 100).toFixed(2)}` : "-";
			const status = inv.status ?? "unknown";
			const date = inv.created_at ? formatDate(inv.created_at) : "-";
			console.log(`  - ${amount} | ${status} | ${date}`);
		}
		if (customer.invoices.length > 5) {
			console.log(`  ... and ${customer.invoices.length - 5} more`);
		}
	}

	// Entities
	if (customer.entities?.length) {
		console.log("");
		console.log(`Entities (${customer.entities.length}):`);
		for (const entity of customer.entities.slice(0, 5)) {
			console.log(`  - ${entity.id} (${entity.name ?? "unnamed"})`);
		}
		if (customer.entities.length > 5) {
			console.log(`  ... and ${customer.entities.length - 5} more`);
		}
	}
}

/**
 * Format a Unix timestamp as a readable date
 */
function formatDate(timestamp: number): string {
	// Handle both seconds and milliseconds
	const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
	return new Date(ms).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/**
 * Escape a value for CSV output
 */
function escapeCsv(value: string): string {
	if (value.includes(",") || value.includes('"') || value.includes("\n")) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}
