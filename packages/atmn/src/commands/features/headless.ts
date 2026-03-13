/**
 * Headless mode for the features command.
 * Provides structured output (text/json/csv) for AI/programmatic interaction.
 */

import { AppEnv } from "../../lib/env/detect.js";
import { getKey } from "../../lib/env/keys.js";
import { fetchFeatures } from "../../lib/api/endpoints/features.js";
import type { ApiFeature } from "../../lib/api/types/index.js";
import { formatError } from "../../lib/api/client.js";

export interface HeadlessFeaturesOptions {
	/** Environment (sandbox/live) */
	prod?: boolean;
	/** Page number */
	page?: number;
	/** Search query */
	search?: string;
	/** Get specific feature by ID */
	id?: string;
	/** Items per page */
	limit?: number;
	/** Output format */
	format?: "text" | "json" | "csv";
	/** Include archived features */
	includeArchived?: boolean;
}

/**
 * Execute a headless features command
 */
export async function headlessFeaturesCommand(
	options: HeadlessFeaturesOptions,
): Promise<void> {
	const environment = options.prod ? AppEnv.Live : AppEnv.Sandbox;
	const format = options.format ?? "text";
	const page = options.page ?? 1;
	const limit = options.limit ?? 50;
	const includeArchived = options.includeArchived ?? false;

	try {
		const secretKey = getKey(environment);

		// Fetch all features
		const allFeatures = await fetchFeatures({
			secretKey,
			includeArchived,
		});

		// Apply search filter if provided
		let filteredFeatures = allFeatures;
		if (options.search) {
			const searchLower = options.search.toLowerCase();
			filteredFeatures = allFeatures.filter(
				(f) =>
					f.name.toLowerCase().includes(searchLower) ||
					f.id.toLowerCase().includes(searchLower) ||
					f.type.toLowerCase().includes(searchLower),
			);
		}

		// If --id is specified, fetch and output that specific feature
		if (options.id) {
			const feature = filteredFeatures.find((f) => f.id === options.id);
			if (!feature) {
				throw new Error(`Feature not found: ${options.id}`);
			}
			outputSingleFeature(feature, format);
			return;
		}

		// Apply pagination
		const startIndex = (page - 1) * limit;
		const endIndex = startIndex + limit;
		const paginatedFeatures = filteredFeatures.slice(startIndex, endIndex);
		const hasMore = endIndex < filteredFeatures.length;

		// Output the list
		outputFeatureList(
			paginatedFeatures,
			{
				page,
				pageSize: limit,
				total: filteredFeatures.length,
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
 * Output a list of features
 */
function outputFeatureList(
	features: ApiFeature[],
	pagination: { page: number; pageSize: number; total: number; hasMore: boolean },
	format: "text" | "json" | "csv",
	search?: string,
): void {
	if (format === "json") {
		console.log(
			JSON.stringify(
				{
					items: features,
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
		console.log("id,name,type,consumable,archived");
		// CSV rows
		for (const f of features) {
			const name = escapeCsv(f.name);
			const type = f.type;
			const consumable = f.consumable ? "true" : "false";
			const archived = f.archived ? "true" : "false";
			console.log(`${f.id},${name},${type},${consumable},${archived}`);
		}
		return;
	}

	// Text format
	const startItem = (pagination.page - 1) * pagination.pageSize + 1;
	const endItem = Math.min(startItem + features.length - 1, pagination.total);
	console.log(`Features (Page ${pagination.page}, showing ${startItem}-${endItem} of ${pagination.total})`);
	console.log("=".repeat(60));

	if (search) {
		console.log(`Search: "${search}"`);
	}

	console.log("");

	if (features.length === 0) {
		console.log("No features found.");
		console.log("");
		console.log("Actions: --search \"query\", --includeArchived");
		return;
	}

	// Calculate column widths
	const idWidth = Math.max(2, ...features.map((f) => f.id.length));
	const nameWidth = Math.max(4, ...features.map((f) => f.name.length));
	const typeWidth = Math.max(4, ...features.map((f) => f.type.length));

	// Header
	console.log(
		`${"ID".padEnd(idWidth)}  ${"Name".padEnd(nameWidth)}  ${"Type".padEnd(typeWidth)}  ${"Consumable".padEnd(10)}  Status`,
	);
	console.log("-".repeat(idWidth + nameWidth + typeWidth + 30));

	// Rows
	for (const f of features) {
		const name = f.name.padEnd(nameWidth);
		const type = f.type.padEnd(typeWidth);
		const consumable = (f.consumable ? "Yes" : "No").padEnd(10);
		const status = f.archived ? "Archived" : "Active";
		console.log(`${f.id.padEnd(idWidth)}  ${name}  ${type}  ${consumable}  ${status}`);
	}

	console.log("");
	const actions: string[] = [];
	if (pagination.hasMore) {
		actions.push(`--page ${pagination.page + 1}`);
	}
	actions.push('--search "query"');
	actions.push('--id "feature_id"');
	console.log(`Actions: ${actions.join(", ")}`);
}

/**
 * Output a single feature with detailed information
 */
function outputSingleFeature(
	feature: ApiFeature,
	format: "text" | "json" | "csv",
): void {
	if (format === "json") {
		console.log(JSON.stringify(feature, null, 2));
		return;
	}

	if (format === "csv") {
		// For single feature, just output basic fields as CSV
		console.log("id,name,type,consumable,archived");
		const name = escapeCsv(feature.name);
		const type = feature.type;
		const consumable = feature.consumable ? "true" : "false";
		const archived = feature.archived ? "true" : "false";
		console.log(`${feature.id},${name},${type},${consumable},${archived}`);
		return;
	}

	// Text format - detailed view
	console.log(`Feature: ${feature.id}`);
	console.log("=".repeat(50));
	console.log("");

	console.log("Basic Info:");
	console.log(`  Name:        ${feature.name}`);
	console.log(`  Type:        ${feature.type}`);
	console.log(`  Consumable:  ${feature.consumable ? "Yes" : "No"}`);
	console.log(`  Archived:    ${feature.archived ? "Yes" : "No"}`);

	// Display names
	if (feature.display) {
		console.log("");
		console.log("Display:");
		console.log(`  Singular:    ${feature.display.singular ?? "-"}`);
		console.log(`  Plural:      ${feature.display.plural ?? "-"}`);
	}

	// Event names (for metered features)
	if (feature.event_names && feature.event_names.length > 0) {
		console.log("");
		console.log(`Event Names (${feature.event_names.length}):`);
		for (const eventName of feature.event_names) {
			console.log(`  - ${eventName}`);
		}
	}

	// Credit schema (for credit_system features)
	if (feature.credit_schema && feature.credit_schema.length > 0) {
		console.log("");
		console.log(`Credit Schema (${feature.credit_schema.length}):`);
		for (const credit of feature.credit_schema) {
			console.log(`  - ${credit.metered_feature_id}: ${credit.credit_cost} credits`);
		}
	}
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
