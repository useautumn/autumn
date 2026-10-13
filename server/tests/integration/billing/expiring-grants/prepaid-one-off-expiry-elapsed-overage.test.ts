// Expiring prepaid one-off plan items: each purchase lands in a loose, expiring grant beside a
// 0-balance keystone row; grants outlive plan changes and churn.

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject.js";
import { deleteExpiredGrants } from "@/internal/customers/cusProducts/cusEnts/actions/deleteExpiredGrants.js";
import { expiringTopUpPlan, messageRows } from "./utils/prepaidOneOffExpiry";

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: an elapsed grant leaves the balance and the sweep deletes it")}`,
	async () => {
		const planId = "expiry-elapsed";
		const customerId = "expiry-elapsed-cus";
		const { autumnV2_1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({ plans: [expiringTopUpPlan(planId)] });
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});

		const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(before.balances[TestFeature.Messages].remaining).toBe(100);

		// Backdate the grant rather than wait two months.
		await ctx.db.execute(sql`
			UPDATE customer_entitlements
			SET expires_at = ${Date.now() - 1000}
			WHERE expires_at IS NOT NULL
				AND customer_product_id IS NULL
				AND internal_customer_id = (
					SELECT internal_id FROM customers
					WHERE id = ${customerId}
						AND org_id = ${ctx.org.id}
						AND env = ${ctx.env}
				)
		`);
		await invalidateCachedFullSubject({ ctx, customerId });

		// elapsed credits are not spendable
		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(after.balances[TestFeature.Messages]?.remaining ?? 0).toBe(0);

		// the sweep deletes the elapsed row, scoped to this customer because the
		// suite runs concurrently against a shared database
		const scoped = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const { deleted } = await deleteExpiredGrants({
			ctx,
			internalCustomerId: scoped.internal_id,
		});
		expect(deleted).toBe(1);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const { keystones, grants } = messageRows({ fullCustomer, planId });
		expect(grants.length).toBe(0);
		// the keystone survives, so the item can still be topped up
		expect(keystones.length).toBe(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: with persist_free_overage on, the purchase still lands in an expiring grant")}`,
	async () => {
		const planId = "expiry-pfo";
		const customerId = "expiry-pfo-cus";
		const { autumnV2_1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				// The overage rebalance only runs for orgs with this flag, and it
				// zeroes every one-off prepaid row it claims — the split has to win.
				s.platform.create({
					userEmail: `expiry-pfo-${Math.random().toString(36).slice(2, 8)}@autumn.test`,
					configOverrides: { persist_free_overage: true },
					setupDefaultFeatures: true,
				}),
				s.customer({ paymentMethod: "success" }),
			],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({ plans: [expiringTopUpPlan(planId)] });
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const { keystones, grants } = messageRows({ fullCustomer, planId });

		// the grant exists and expires; the keystone was not left holding 100
		expect(grants.length).toBe(1);
		expect(grants[0].balance).toBe(100);
		expect(grants[0].expires_at).toBeGreaterThan(Date.now());
		expect(keystones[0].balance).toBe(0);

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(100);
	},
);
