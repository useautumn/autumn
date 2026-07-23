import {
	type ApiInsertedInvoice,
	customers,
	ErrCode,
	entities,
	type InsertInvoice,
	type InsertInvoicesParams,
	type InsertInvoicesResponse,
	invoices,
	type ProcessorType,
	products,
	RecaseError,
} from "@autumn/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { generateId } from "@/utils/genUtils";

const referenceError = (message: string) =>
	new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});

const entityKey = ({
	internalCustomerId,
	entityId,
}: {
	internalCustomerId: string;
	entityId: string;
}) => `${internalCustomerId}:${entityId}`;

export const insertInvoices = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: InsertInvoicesParams;
}): Promise<InsertInvoicesResponse> => {
	if (params.invoices.length === 0) return { invoices: [] };

	const stripeIds = params.invoices.map((invoice) => invoice.stripe_id);
	if (new Set(stripeIds).size !== stripeIds.length) {
		throw referenceError(
			"Duplicate stripe_id values are not allowed in one batch",
		);
	}

	const customerIds = [
		...new Set(params.invoices.map((invoice) => invoice.customer_id)),
	];
	const planIds = [
		...new Set(params.invoices.flatMap((invoice) => invoice.plan_ids)),
	];

	const latestPlanVersions = ctx.db
		.select({
			id: products.id,
			maxVersion: sql<number>`MAX(${products.version})`.as("max_version"),
		})
		.from(products)
		.where(
			and(
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
				planIds.length > 0 ? inArray(products.id, planIds) : undefined,
			),
		)
		.groupBy(products.id)
		.as("latest_plan_versions");

	const [customerRows, planRows, existingRows] = await Promise.all([
		ctx.db
			.select({ id: customers.id, internalId: customers.internal_id })
			.from(customers)
			.where(
				and(
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
					inArray(customers.id, customerIds),
				),
			),
		planIds.length > 0
			? ctx.db
					.select({ id: products.id, internalId: products.internal_id })
					.from(products)
					.innerJoin(
						latestPlanVersions,
						and(
							eq(products.id, latestPlanVersions.id),
							eq(products.version, latestPlanVersions.maxVersion),
						),
					)
					.where(
						and(
							eq(products.org_id, ctx.org.id),
							eq(products.env, ctx.env),
							inArray(products.id, planIds),
						),
					)
			: Promise.resolve([]),
		ctx.db
			.select({
				stripeId: invoices.stripe_id,
				customerId: customers.id,
				orgId: customers.org_id,
				env: customers.env,
			})
			.from(invoices)
			.innerJoin(
				customers,
				eq(invoices.internal_customer_id, customers.internal_id),
			)
			.where(inArray(invoices.stripe_id, stripeIds)),
	]);

	const customerById = new Map(customerRows.map((row) => [row.id, row]));
	const missingCustomerIds = customerIds.filter((id) => !customerById.has(id));
	if (missingCustomerIds.length > 0) {
		throw referenceError(
			`Customers not found: ${missingCustomerIds.join(", ")}`,
		);
	}

	const planById = new Map(planRows.map((row) => [row.id, row]));
	const missingPlanIds = planIds.filter((id) => !planById.has(id));
	if (missingPlanIds.length > 0) {
		throw referenceError(`Plans not found: ${missingPlanIds.join(", ")}`);
	}

	const foreignInvoice = existingRows.find(
		(row) => row.orgId !== ctx.org.id || row.env !== ctx.env,
	);
	if (foreignInvoice) {
		throw referenceError(
			`Invoice ${foreignInvoice.stripeId} belongs to another organization or environment`,
		);
	}

	const requestedEntityIds = [
		...new Set(
			params.invoices.flatMap((invoice) =>
				invoice.entity_id ? [invoice.entity_id] : [],
			),
		),
	];
	const entityRows =
		requestedEntityIds.length > 0
			? await ctx.db
					.select({
						id: entities.id,
						internalId: entities.internal_id,
						internalCustomerId: entities.internal_customer_id,
					})
					.from(entities)
					.where(
						and(
							inArray(entities.id, requestedEntityIds),
							inArray(
								entities.internal_customer_id,
								customerRows.map((customer) => customer.internalId),
							),
						),
					)
			: [];
	const entityByCustomerAndId = new Map(
		entityRows.map((entity) => [
			entityKey({
				internalCustomerId: entity.internalCustomerId,
				entityId: entity.id ?? "",
			}),
			entity,
		]),
	);

	const rows: InsertInvoice[] = params.invoices.map((invoice) => {
		const customer = customerById.get(invoice.customer_id)!;
		const entity = invoice.entity_id
			? entityByCustomerAndId.get(
					entityKey({
						internalCustomerId: customer.internalId,
						entityId: invoice.entity_id,
					}),
				)
			: undefined;
		if (invoice.entity_id && !entity) {
			throw referenceError(
				`Entity ${invoice.entity_id} not found for customer ${invoice.customer_id}`,
			);
		}

		return {
			id: generateId("inv"),
			created_at: invoice.created_at,
			product_ids: invoice.plan_ids,
			internal_product_ids: invoice.plan_ids.map(
				(planId) => planById.get(planId)!.internalId,
			),
			internal_customer_id: customer.internalId,
			internal_entity_id: entity?.internalId ?? null,
			stripe_id: invoice.stripe_id,
			processor_type: invoice.processor_type,
			status: invoice.status,
			hosted_invoice_url: invoice.hosted_invoice_url,
			total: invoice.total,
			amount_paid: invoice.amount_paid,
			refunded_amount: invoice.refunded_amount,
			currency: invoice.currency ?? ctx.org.default_currency ?? "usd",
			discounts: [],
			items: [],
		};
	});

	const upsertedRows = await ctx.db
		.insert(invoices)
		.values(rows)
		.onConflictDoUpdate({
			target: invoices.stripe_id,
			set: {
				created_at: sql`excluded.created_at`,
				product_ids: sql`excluded.product_ids`,
				internal_product_ids: sql`excluded.internal_product_ids`,
				internal_customer_id: sql`excluded.internal_customer_id`,
				internal_entity_id: sql`excluded.internal_entity_id`,
				processor_type: sql`excluded.processor_type`,
				status: sql`excluded.status`,
				hosted_invoice_url: sql`excluded.hosted_invoice_url`,
				total: sql`excluded.total`,
				amount_paid: sql`excluded.amount_paid`,
				refunded_amount: sql`excluded.refunded_amount`,
				currency: sql`excluded.currency`,
			},
		})
		.returning();
	const rowByStripeId = new Map(
		upsertedRows.map((invoice) => [invoice.stripe_id, invoice]),
	);

	const responseInvoices: ApiInsertedInvoice[] = params.invoices.map(
		(invoice) => {
			const row = rowByStripeId.get(invoice.stripe_id)!;
			return {
				id: row.id,
				customer_id: invoice.customer_id,
				plan_ids: row.product_ids ?? [],
				stripe_id: row.stripe_id,
				processor_type: (row.processor_type ??
					invoice.processor_type) as ProcessorType,
				status: row.status,
				total: row.total,
				amount_paid: row.amount_paid ?? null,
				refunded_amount: row.refunded_amount,
				currency: row.currency,
				created_at: row.created_at,
				hosted_invoice_url: row.hosted_invoice_url ?? null,
			};
		},
	);

	const customerIdsToInvalidate = new Set<string>(customerIds);
	for (const existing of existingRows) {
		if (existing.customerId) customerIdsToInvalidate.add(existing.customerId);
	}
	await Promise.all(
		[...customerIdsToInvalidate].map((customerId) =>
			deleteCachedFullCustomer({
				ctx,
				customerId,
				source: "invoices.insert",
			}),
		),
	);

	return { invoices: responseInvoices };
};
