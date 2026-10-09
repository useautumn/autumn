/**
 * Every invoice row carries its customer's org_id and env.
 *
 * Contract:
 *   attach (Stripe invoice insert)       → row.org_id/env = the customer's
 *   invoices.insert (batch upsert)       → row.org_id/env = the customer's
 *   invoices.insert moving a stripe_id   → row follows the new customer's org/env
 */

import { expect, test } from "bun:test";
import { invoices } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";

const tenantOf = async ({
	internalCustomerIds,
}: {
	internalCustomerIds: string[];
}) =>
	ctx.db
		.select({
			stripe_id: invoices.stripe_id,
			internal_customer_id: invoices.internal_customer_id,
			org_id: invoices.org_id,
			env: invoices.env,
		})
		.from(invoices)
		.where(inArray(invoices.internal_customer_id, internalCustomerIds));

test.concurrent(
	`${chalk.yellowBright("invoices: rows carry the customer's org_id and env on every write path")}`,
	async () => {
		const customerId = "inv-tenant-a";
		const otherCustomerId = "inv-tenant-b";
		const movedStripeId = `in_tenant_moved_${Date.now()}`;
		const pro = products.pro({
			id: "pro-inv-tenant",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: otherCustomerId }]),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const customerRows = await ctx.db.query.customers.findMany({
			where: (customer, { and, eq: eqOp, inArray: inArrayOp }) =>
				and(
					eqOp(customer.org_id, ctx.org.id),
					eqOp(customer.env, ctx.env),
					inArrayOp(customer.id, [customerId, otherCustomerId]),
				),
		});
		const internalIdOf = new Map(
			customerRows.map((row) => [row.id, row.internal_id]),
		);
		const internalCustomerIds = [
			internalIdOf.get(customerId)!,
			internalIdOf.get(otherCustomerId)!,
		];

		const attachRows = await tenantOf({ internalCustomerIds });
		expect(attachRows.length).toBeGreaterThan(0);

		await autumnV2_2.post("/invoices.insert", {
			invoices: [
				{
					customer_id: customerId,
					stripe_id: movedStripeId,
					status: "paid",
					total: 5,
					created_at: Date.now(),
				},
			],
		});
		await autumnV2_2.post("/invoices.insert", {
			invoices: [
				{
					customer_id: otherCustomerId,
					stripe_id: movedStripeId,
					status: "paid",
					total: 5,
					created_at: Date.now(),
				},
			],
		});

		const rows = await tenantOf({ internalCustomerIds });
		expect(rows.length).toBe(attachRows.length + 1);
		for (const row of rows) {
			expect(row).toMatchObject({ org_id: ctx.org.id, env: ctx.env });
		}

		const moved = await ctx.db.query.invoices.findFirst({
			where: eq(invoices.stripe_id, movedStripeId),
		});
		expect(moved).toMatchObject({
			internal_customer_id: internalIdOf.get(otherCustomerId),
			org_id: ctx.org.id,
			env: ctx.env,
		});
	},
);
