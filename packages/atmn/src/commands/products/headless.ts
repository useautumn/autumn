/**
 * Headless mode for the products command.
 * Provides structured output (text/json/csv) for AI/programmatic interaction.
 */

import { AppEnv } from "../../lib/env/detect.js";
import { getKey } from "../../lib/env/keys.js";
import { fetchPlans } from "../../lib/api/endpoints/plans.js";
import type { ApiPlan } from "../../lib/api/types/index.js";
import { formatError } from "../../lib/api/client.js";

export interface HeadlessProductsOptions {
	/** Environment (sandbox/live) */
	prod?: boolean;
	/** Page number */
	page?: number;
	/** Search query */
	search?: string;
	/** Get specific product by ID */
	id?: string;
	/** Items per page */
	limit?: number;
	/** Output format */
	format?: "text" | "json" | "csv";
	/** Include archived products */
	includeArchived?: boolean;
}

/**
 * Execute a headless products command
 */
export async function headlessProductsCommand(
	options: HeadlessProductsOptions,
): Promise<void> {
	const environment = options.prod ? AppEnv.Live : AppEnv.Sandbox;
	const format = options.format ?? "text";
	const page = options.page ?? 1;
	const limit = options.limit ?? 50;
	const includeArchived = options.includeArchived ?? false;

	try {
		const secretKey = getKey(environment);

		// Fetch all products
		const allProducts = await fetchPlans({
			secretKey,
			includeArchived,
		});

		// Apply search filter if provided
		let filteredProducts = allProducts;
		if (options.search) {
			const searchLower = options.search.toLowerCase();
			filteredProducts = allProducts.filter(
				(p) =>
					p.name.toLowerCase().includes(searchLower) ||
					p.id.toLowerCase().includes(searchLower) ||
					(p.description?.toLowerCase().includes(searchLower) ?? false),
			);
		}

		// If --id is specified, fetch and output that specific product
		if (options.id) {
			const product = filteredProducts.find((p) => p.id === options.id);
			if (!product) {
				throw new Error(`Product not found: ${options.id}`);
			}
			outputSingleProduct(product, format);
			return;
		}

		// Apply pagination
		const startIndex = (page - 1) * limit;
		const endIndex = startIndex + limit;
		const paginatedProducts = filteredProducts.slice(startIndex, endIndex);
		const hasMore = endIndex < filteredProducts.length;

		// Output the list
		outputProductList(
			paginatedProducts,
			{
				page,
				pageSize: limit,
				total: filteredProducts.length,
				hasMore,
			},
			format,
			options.search,
		);
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
 * Output a list of products
 */
function outputProductList(
	products: ApiPlan[],
	pagination: { page: number; pageSize: number; total: number; hasMore: boolean },
	format: "text" | "json" | "csv",
	search?: string,
): void {
	if (format === "json") {
		console.log(
			JSON.stringify(
				{
					items: products,
					pagination: {
						page: pagination.page,
						pageSize: pagination.pageSize,
						total: pagination.total,
						hasMore: pagination.hasMore,
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
		console.log("id,name,version,type,price,items_count,created_at");
		// CSV rows
		for (const p of products) {
			const name = escapeCsv(p.name);
			const version = p.version;
			const type = p.add_on ? "Add-on" : p.auto_enable ? "Default" : "Plan";
			const price = p.price?.amount ?? 0;
			const featuresCount = p.items?.length ?? 0;
			const created = new Date(normalizeTimestamp(p.created_at)).toISOString();
			console.log(`${p.id},${name},${version},${type},${price},${featuresCount},${created}`);
		}
		return;
	}

	// Text format
	const startItem = (pagination.page - 1) * pagination.pageSize + 1;
	const endItem = Math.min(startItem + products.length - 1, pagination.total);
	console.log(`Products (Page ${pagination.page}, showing ${startItem}-${endItem} of ${pagination.total})`);
	console.log("=".repeat(60));

	if (search) {
		console.log(`Search: "${search}"`);
	}

	console.log("");

	if (products.length === 0) {
		console.log("No products found.");
		console.log("");
		console.log("Actions: --search \"query\", --includeArchived");
		return;
	}

	// Calculate column widths
	const idWidth = Math.max(2, ...products.map((p) => p.id.length));
	const nameWidth = Math.max(4, ...products.map((p) => p.name.length));

	// Header
	console.log(
		`${"ID".padEnd(idWidth)}  ${"Name".padEnd(nameWidth)}  ${"Ver".padEnd(4)}  ${"Type".padEnd(7)}  ${"Price".padEnd(14)}  Items`,
	);
	console.log("-".repeat(idWidth + nameWidth + 50));

	// Rows
	for (const p of products) {
		const name = p.name.padEnd(nameWidth);
		const version = `v${p.version}`.padEnd(4);
		const type = (p.add_on ? "Add-on" : p.auto_enable ? "Default" : "Plan").padEnd(7);
		const price = formatPrice(p.price?.amount ?? 0, p.price?.interval).padEnd(14);
		const featuresCount = p.items?.length ?? 0;
		console.log(`${p.id.padEnd(idWidth)}  ${name}  ${version}  ${type}  ${price}  ${featuresCount}`);
	}

	console.log("");
	const actions: string[] = [];
	if (pagination.hasMore) {
		actions.push(`--page ${pagination.page + 1}`);
	}
	actions.push('--search "query"');
	actions.push('--id "plan_xxx"');
	console.log(`Actions: ${actions.join(", ")}`);
}

/**
 * Output a single product with detailed information
 */
function outputSingleProduct(
	product: ApiPlan,
	format: "text" | "json" | "csv",
): void {
	if (format === "json") {
		console.log(JSON.stringify(product, null, 2));
		return;
	}

	if (format === "csv") {
		// For single product, just output basic fields as CSV
		console.log("id,name,version,type,items_count,price,created_at");
		const name = escapeCsv(product.name);
		const version = product.version;
		const type = product.add_on ? "Add-on" : product.auto_enable ? "Default" : "Plan";
		const price = product.price?.amount ?? 0;
		const featuresCount = product.items?.length ?? 0;
		const created = new Date(normalizeTimestamp(product.created_at)).toISOString();
		console.log(`${product.id},${name},${version},${type},${featuresCount},${price},${created}`);
		return;
	}

	// Text format - detailed view
	console.log(`Product: ${product.id}`);
	console.log("=".repeat(50));
	console.log("");

	console.log("Basic Info:");
	console.log(`  Name:        ${product.name}`);
	console.log(`  Description: ${product.description ?? "-"}`);
	console.log(`  Version:     v${product.version}`);
	console.log(
		`  Type:        ${product.add_on ? "Add-on" : product.auto_enable ? "Default" : "Plan"}`,
	);
	console.log(`  Group:       ${product.group ?? "-"}`);
	console.log(`  Default:     ${product.auto_enable ? "Yes" : "No"}`);
	console.log(`  Archived:    ${product.archived ? "Yes" : "No"}`);
	console.log(`  Environment: ${product.env}`);
	console.log(`  Created:     ${formatDate(product.created_at)}`);

	// Price
	if (product.price) {
		console.log("");
		console.log("Pricing:");
		console.log(`  Amount:      ${formatPrice(product.price.amount, product.price.interval)}`);
		console.log(`  Interval:    ${product.price.interval}`);
		if (product.price.interval_count && product.price.interval_count > 1) {
			console.log(`  Every:       ${product.price.interval_count} ${product.price.interval}s`);
		}
	}

	// Free trial
	if (product.free_trial) {
		console.log("");
		console.log("Free Trial:");
		console.log(`  Duration:    ${product.free_trial.duration_length} ${product.free_trial.duration_type}`);
		console.log(`  Card Required: ${product.free_trial.card_required ? "Yes" : "No"}`);
	}

	// Items
	if (product.items && product.items.length > 0) {
		console.log("");
		console.log(`Items (${product.items.length}):`);
		for (const feature of product.items) {
			const featureName = feature.feature?.name ?? feature.feature_id;
			let valueStr = "";

			if (feature.unlimited) {
				valueStr = "Unlimited";
			} else if (feature.included !== undefined && feature.included !== null) {
				valueStr = `${feature.included}`;
			}

			if (feature.price) {
				const priceStr =
					feature.price.amount !== undefined
						? formatPrice(feature.price.amount, feature.price.interval)
						: `Tiered/${feature.price.interval}`;
				valueStr += valueStr ? ` (${priceStr})` : priceStr;
			}

			console.log(`  - ${featureName}${valueStr ? `: ${valueStr}` : ""}`);
		}
	}
}

/**
 * Format a price amount and interval for display
 */
function formatPrice(amount: number, interval?: string): string {
	const dollars = (amount / 100).toFixed(2);
	if (interval) {
		return `$${dollars}/${interval}`;
	}
	return `$${dollars}`;
}

/**
 * Normalize a timestamp to milliseconds.
 * Handles both Unix timestamps (seconds) and JS timestamps (milliseconds).
 */
function normalizeTimestamp(timestamp: number): number {
	// If timestamp is less than ~10 billion, it's in seconds, convert to ms
	return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

/**
 * Format a Unix timestamp as a readable date
 */
function formatDate(timestamp: number): string {
	const ms = normalizeTimestamp(timestamp);
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
