/**
 * TDD test for POST /v1/invoices.insert — batched legacy invoice upserts.
 *
 * Contract under test:
 *   New types/fields:
 *     - InsertInvoicesParams: { invoices: InsertInvoiceParams[] } with max 500
 *     - entity_id is accepted by the server but hidden from public docs/output
 *   New endpoint:
 *     - POST /v1/invoices.insert -> { invoices: ApiInsertedInvoice[] }
 *   New behaviors:
 *     - response order matches request order
 *     - customer_id, entity_id, and latest plan versions resolve in batched queries
 *     - currency defaults to org.default_currency
 *     - hosted_invoice_url is optional, persisted, and echoed directly
 *     - existing stripe_id rows are fully updated while retaining their Autumn IDs
 *     - all affected customer caches are invalidated; no invoice cache write occurs
 *     - invalid customer/entity/plan references reject the batch before any writes
 *   Side effects:
 *     - invoices are upserted in Postgres only
 *     - affected customer caches are cleared after the upsert
 *     - no processor resources are read or mutated
 *
 * Pre-implementation red: the route and request/response schemas do not exist.
 * Post-implementation green: every batch, resolution, upsert, and validation assertion passes.
 */

import { expect, test } from "bun:test";
import { CustomerExpand, invoices, products } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products as productFixtures } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";

test.concurrent(
	`${chalk.yellowBright("invoices.insert: batch upserts legacy invoices in request order")}`,
	async () => {
		const customerId = "invoice-batch-a";
		const otherCustomerId = "invoice-batch-b";
		const runTag = Date.now().toString();
		const firstStripeId = `in_legacy_first_${runTag}`;
		const secondStripeId = `in_legacy_second_${runTag}`;
		const originalCreatedAt = Date.UTC(2016, 0, 1);

		const pro = productFixtures.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const free = productFixtures.base({ id: "free", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro, free] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.otherCustomers([{ id: otherCustomerId }]),
			],
			actions: [],
		});

		const customerRows = await ctx.db.query.customers.findMany({
			where: (customer, { and: andOp, eq: eqOp, inArray }) =>
				andOp(
					eqOp(customer.org_id, ctx.org.id),
					eqOp(customer.env, ctx.env),
					inArray(customer.id, [customerId, otherCustomerId]),
				),
		});
		const customerById = new Map(customerRows.map((row) => [row.id, row]));
		const primaryCustomer = customerById.get(customerId);
		const otherCustomer = customerById.get(otherCustomerId);
		expect(primaryCustomer).toBeDefined();
		expect(otherCustomer).toBeDefined();

		const entity = await ctx.db.query.entities.findFirst({
			where: (entity, { and: andOp, eq: eqOp }) =>
				andOp(
					eqOp(entity.internal_customer_id, primaryCustomer!.internal_id),
					eqOp(entity.id, "ent-1"),
				),
		});
		expect(entity).toBeDefined();

		const proV1 = await ctx.db.query.products.findFirst({
			where: and(
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
				eq(products.id, pro.id),
			),
		});
		expect(proV1).toBeDefined();
		const proV2InternalId = `prod_invoice_v2_${runTag}`;
		await ctx.db.insert(products).values({
			...proV1!,
			internal_id: proV2InternalId,
			version: proV1!.version + 1,
			created_at: proV1!.created_at + 1,
		});

		const freePlan = await ctx.db.query.products.findFirst({
			where: and(
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
				eq(products.id, free.id),
			),
		});
		expect(freePlan).toBeDefined();

		await Promise.all([
			autumnV2_2.customers.get(customerId, {
				expand: [CustomerExpand.Invoices],
			}),
			autumnV2_2.customers.get(otherCustomerId, {
				expand: [CustomerExpand.Invoices],
			}),
		]);

		// ── Contract assertion 1: heterogeneous batch and response ordering ──
		const inserted = await autumnV2_2.post("/invoices.insert", {
			invoices: [
				{
					customer_id: customerId,
					entity_id: "ent-1",
					plan_ids: [pro.id],
					stripe_id: firstStripeId,
					processor_type: "stripe",
					status: "paid",
					total: 29.99,
					amount_paid: 29.99,
					refunded_amount: 0,
					created_at: originalCreatedAt,
					hosted_invoice_url: "https://billing.example.com/invoices/first",
				},
				{
					customer_id: otherCustomerId,
					plan_ids: [free.id],
					stripe_id: secondStripeId,
					status: "open",
					total: 10,
					created_at: originalCreatedAt + 1,
				},
			],
		});

		expect(inserted.invoices).toHaveLength(2);
		expect(
			inserted.invoices.map(
				(invoice: { stripe_id: string }) => invoice.stripe_id,
			),
		).toEqual([firstStripeId, secondStripeId]);
		expect(inserted.invoices[0]).toMatchObject({
			customer_id: customerId,
			plan_ids: [pro.id],
			stripe_id: firstStripeId,
			processor_type: "stripe",
			status: "paid",
			total: 29.99,
			amount_paid: 29.99,
			refunded_amount: 0,
			currency: ctx.org.default_currency,
			created_at: originalCreatedAt,
			hosted_invoice_url: "https://billing.example.com/invoices/first",
		});
		expect("entity_id" in inserted.invoices[0]).toBe(false);
		expect(inserted.invoices[1]).toMatchObject({
			customer_id: otherCustomerId,
			plan_ids: [free.id],
			stripe_id: secondStripeId,
			processor_type: "stripe",
			status: "open",
			total: 10,
			amount_paid: null,
			refunded_amount: 0,
			currency: ctx.org.default_currency,
			created_at: originalCreatedAt + 1,
			hosted_invoice_url: null,
		});

		// ── Contract assertion 2: external IDs resolve to internal IDs ───────
		const firstStored = await ctx.db.query.invoices.findFirst({
			where: eq(invoices.stripe_id, firstStripeId),
		});
		const secondStored = await ctx.db.query.invoices.findFirst({
			where: eq(invoices.stripe_id, secondStripeId),
		});
		expect(firstStored).toMatchObject({
			id: inserted.invoices[0].id,
			internal_customer_id: primaryCustomer!.internal_id,
			internal_entity_id: entity!.internal_id,
			product_ids: [pro.id],
			internal_product_ids: [proV2InternalId],
		});
		expect(secondStored).toMatchObject({
			id: inserted.invoices[1].id,
			internal_customer_id: otherCustomer!.internal_id,
			internal_entity_id: null,
			product_ids: [free.id],
			internal_product_ids: [freePlan!.internal_id],
		});

		// ── Contract assertion 3: upsert fully replaces submitted fields ─────
		const updatedCreatedAt = originalCreatedAt + 10_000;
		const updated = await autumnV2_2.post("/invoices.insert", {
			invoices: [
				{
					customer_id: otherCustomerId,
					plan_ids: [free.id],
					stripe_id: firstStripeId,
					processor_type: "revenuecat",
					status: "void",
					total: 40,
					amount_paid: 20,
					refunded_amount: 5,
					currency: "eur",
					created_at: updatedCreatedAt,
					hosted_invoice_url: "https://billing.example.com/invoices/updated",
				},
				{
					customer_id: customerId,
					plan_ids: [pro.id],
					stripe_id: secondStripeId,
					status: "paid",
					total: 12,
					amount_paid: 12,
					created_at: updatedCreatedAt + 1,
				},
			],
		});
		expect(
			updated.invoices.map(
				(invoice: { stripe_id: string }) => invoice.stripe_id,
			),
		).toEqual([firstStripeId, secondStripeId]);
		expect(updated.invoices[0]).toMatchObject({
			id: inserted.invoices[0].id,
			customer_id: otherCustomerId,
			plan_ids: [free.id],
			processor_type: "revenuecat",
			status: "void",
			total: 40,
			amount_paid: 20,
			refunded_amount: 5,
			currency: "eur",
			created_at: updatedCreatedAt,
			hosted_invoice_url: "https://billing.example.com/invoices/updated",
		});

		const firstUpdatedStored = await ctx.db.query.invoices.findFirst({
			where: eq(invoices.stripe_id, firstStripeId),
		});
		expect(firstUpdatedStored).toMatchObject({
			id: inserted.invoices[0].id,
			internal_customer_id: otherCustomer!.internal_id,
			internal_entity_id: null,
			product_ids: [free.id],
			internal_product_ids: [freePlan!.internal_id],
			processor_type: "revenuecat",
			status: "void",
			total: 40,
			amount_paid: 20,
			refunded_amount: 5,
			currency: "eur",
			created_at: updatedCreatedAt,
			hosted_invoice_url: "https://billing.example.com/invoices/updated",
		});

		// ── Contract assertion 4: caches are invalidated, not invoice-upserted ─
		const refreshedOtherCustomer = await autumnV2_2.customers.get(
			otherCustomerId,
			{
				expand: [CustomerExpand.Invoices],
			},
		);
		expect(
			refreshedOtherCustomer.invoices.some(
				(invoice: { stripe_id: string }) => invoice.stripe_id === firstStripeId,
			),
		).toBe(true);

		// ── Contract assertion 5: invalid references reject before writes ─────
		const invalidStripeId = `in_invalid_${runTag}`;
		expect(
			autumnV2_2.post("/invoices.insert", {
				invoices: [
					{
						customer_id: customerId,
						plan_ids: [pro.id],
						stripe_id: `in_valid_sibling_${runTag}`,
						status: "paid",
						total: 1,
						created_at: originalCreatedAt,
					},
					{
						customer_id: "missing-customer",
						plan_ids: ["missing-plan"],
						stripe_id: invalidStripeId,
						status: "paid",
						total: 1,
						created_at: originalCreatedAt,
					},
				],
			}),
		).rejects.toThrow();
		const invalidRows = await ctx.db.query.invoices.findMany({
			where: (invoice, { inArray }) =>
				inArray(invoice.stripe_id, [
					`in_valid_sibling_${runTag}`,
					invalidStripeId,
				]),
		});
		expect(invalidRows).toHaveLength(0);

		// ── Contract assertion 6: request size is capped at 500 ──────────────
		expect(
			autumnV2_2.post("/invoices.insert", {
				invoices: Array.from({ length: 501 }, (_, index) => ({
					customer_id: customerId,
					stripe_id: `in_too_many_${runTag}_${index}`,
					status: "paid",
					total: 1,
					created_at: originalCreatedAt,
				})),
			}),
		).rejects.toThrow();
	},
);
