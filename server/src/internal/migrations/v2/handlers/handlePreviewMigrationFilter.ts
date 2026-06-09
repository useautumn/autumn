import {
	CustomerFilterSchema,
	customerProducts,
	customers,
	MigrationItemKind,
	products,
	RELEVANT_STATUSES,
	Scopes,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CustomerListFiltersSchema } from "@/internal/customers/customerListFilters.js";
import {
	countCustomers,
	filterCustomers,
} from "@/internal/migrations/v2/filters/customers/filterCustomers.js";
import type { IncludeProcessed } from "../filters/customers/buildCustomerSelect.js";
import { migrationItemRunRepo, migrationRepo } from "../repos/index.js";

const DEFAULT_PAGE_SIZE = 10;

const PreviewFilterBody = z.object({
	filter: CustomerFilterSchema.optional().default({}),
	search: z.string().optional().default(""),
	customerFilters: CustomerListFiltersSchema.optional(),
	page: z.number().int().min(0).optional().default(0),
	pageSize: z
		.number()
		.int()
		.min(1)
		.max(500)
		.optional()
		.default(DEFAULT_PAGE_SIZE),
	migrationId: z.string().optional(),
	executionStatuses: z
		.array(z.enum(["succeeded", "skipped", "failed", "not_run"]))
		.optional()
		.default([]),
	migrationRunId: z.string().optional(),
	migrationRunDryRun: z.boolean().optional(),
});

/** POST /migrations.filter.preview — count + enriched paginated customers. */
export const handlePreviewMigrationFilter = createRoute({
	scopes: [Scopes.Migrations.Read],
	body: PreviewFilterBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const {
			filter,
			search,
			customerFilters,
			page,
			pageSize,
			migrationId,
			executionStatuses,
			migrationRunId,
			migrationRunDryRun,
		} = c.req.valid("json");

		const searchTerm = search || undefined;

		// An empty customer scope compiles to nothing (wrapAnd throws). Treat "no
		// active filter" as selecting nobody rather than 500ing the preview.
		const hasAnyField = Object.values(filter ?? {}).some(
			(v) => v !== undefined,
		);
		if (!hasAnyField) {
			return c.json({ count: 0, customers: [], page, pageSize });
		}

		let includeProcessed: IncludeProcessed | undefined;
		let migrationInternalId: string | undefined;
		if (migrationId) {
			const migration = await migrationRepo.find({ ctx, id: migrationId });
			migrationInternalId = migration.internal_id;
			includeProcessed = {
				migrationInternalId: migration.internal_id,
				executionFilter:
					executionStatuses.length > 0
						? {
								statuses: executionStatuses,
								migrationRunId,
								dryRun: migrationRunDryRun,
							}
						: undefined,
			};
		}

		const [count, pageRows] = await Promise.all([
			countCustomers({
				ctx,
				filter,
				search: searchTerm,
				customerFilters,
				includeProcessed,
			}),
			collectPage(
				filterCustomers({
					ctx,
					filter,
					search: searchTerm,
					customerFilters,
					includeProcessed,
					batchSize: pageSize,
				}),
				page * pageSize,
				pageSize,
			),
		]);

		if (pageRows.length === 0) {
			return c.json({ count, customers: [], page, pageSize });
		}

		const enriched = await enrichCustomers(
			ctx.db,
			pageRows.map((r) => r.internal_id),
		);
		const itemRuns = migrationInternalId
			? await migrationItemRunRepo.listForItems({
					ctx,
					migrationInternalId,
					itemKind: MigrationItemKind.Customer,
					itemIds: pageRows.map((r) => r.internal_id),
					dryRun: false,
				})
			: [];
		const itemRunsByCustomer = new Map(
			itemRuns.map((run) => [run.item_id, run]),
		);

		const grouped = groupByCustomer(enriched).map((customer) => ({
			...customer,
			migration_item_run:
				itemRunsByCustomer.get(customer.internal_id as string) ?? null,
		}));

		return c.json({ count, customers: grouped, page, pageSize });
	},
});

async function enrichCustomers(db: DrizzleCli, ids: string[]) {
	return db
		.select({
			internal_id: customers.internal_id,
			id: customers.id,
			name: customers.name,
			email: customers.email,
			created_at: customers.created_at,
			org_id: customers.org_id,
			env: customers.env,
			fingerprint: customers.fingerprint,
			metadata: customers.metadata,
			processor: customers.processor,
			processors: customers.processors,
			send_email_receipts: customers.send_email_receipts,
			auto_topups: customers.auto_topups,
			spend_limits: customers.spend_limits,
			usage_alerts: customers.usage_alerts,
			overage_allowed: customers.overage_allowed,
			config: customers.config,
			customer_product: {
				id: customerProducts.id,
				internal_product_id: customerProducts.internal_product_id,
				product_id: customerProducts.product_id,
				canceled_at: customerProducts.canceled_at,
				status: customerProducts.status,
				trial_ends_at: customerProducts.trial_ends_at,
				created_at: customerProducts.created_at,
			},
			product: {
				internal_id: products.internal_id,
				id: products.id,
				name: products.name,
				version: products.version,
				is_add_on: products.is_add_on,
			},
		})
		.from(customers)
		.leftJoin(
			customerProducts,
			and(
				eq(customers.internal_id, customerProducts.internal_customer_id),
				inArray(customerProducts.status, RELEVANT_STATUSES),
			),
		)
		.leftJoin(
			products,
			eq(customerProducts.internal_product_id, products.internal_id),
		)
		.where(inArray(customers.internal_id, ids));
}

function groupByCustomer(rows: Array<Record<string, unknown>>) {
	const map = new Map<string, Record<string, unknown>>();
	for (const row of rows) {
		const id = row.internal_id as string;
		if (!map.has(id)) {
			const {
				customer_product: _customerProduct,
				product: _product,
				...customer
			} = row;
			map.set(id, { ...customer, customer_products: [] });
		}
		if (
			row.customer_product &&
			(row.customer_product as Record<string, unknown>).id
		) {
			const entry = map.get(id)!;
			(entry.customer_products as unknown[]).push({
				...(row.customer_product as Record<string, unknown>),
				product: row.product,
			});
		}
	}
	return Array.from(map.values());
}

async function collectPage<T>(
	gen: AsyncGenerator<T[]>,
	skip: number,
	take: number,
): Promise<T[]> {
	const rows: T[] = [];
	let skipped = 0;
	for await (const batch of gen) {
		for (const row of batch) {
			if (skipped < skip) {
				skipped++;
				continue;
			}
			rows.push(row);
			if (rows.length >= take) return rows;
		}
	}
	return rows;
}
