/**
 * TDD test for expiring prepaid one-off plan items.
 *
 * Contract under test:
 *   New fields:
 *     - plan item `expiry: { duration: EntitlementDuration, length: number }`
 *       persisted to entitlements.expiry_duration / expiry_length
 *   New behaviors:
 *     - attach with quantity N  -> keystone cus_ent (balance 0, expires_at null)
 *                               -> grant cus_ent (balance N, adjustment N, expires_at stamped)
 *                               -> both share ONE entitlement_id
 *     - manual top-up           -> one more grant row, its own expires_at
 *     - expiry on a recurring / non-prepaid item -> 400
 *     - repeated top-ups split every time, each grant staying positive
 *     - an elapsed grant leaves the balance, and the sweep deletes it
 *     - cusProduct.is_custom stays false
 *   Side effects:
 *     - no extra rows in `entitlements` beyond the catalog item
 *
 * Pre-impl red: `expiry` is not in the plan item schema, nothing stamps
 * expires_at, and the purchased balance lands on the item row itself.
 * Post-impl green: expiry flows catalog -> entitlement -> grant rows.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	BillingMethod,
	EntitlementDuration,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject.js";
import { deleteExpiredGrants } from "@/internal/customers/cusProducts/cusEnts/actions/deleteExpiredGrants.js";
import { ProductService } from "@/internal/products/ProductService.js";

const EXPIRY = { duration: EntitlementDuration.Month, length: 2 };

/** Auto top-up runs through SQS, so the assertions wait for the worker. */
const AUTO_TOPUP_WAIT_MS = 20000;

const expiringItem = {
	feature_id: TestFeature.Messages,
	included: 0,
	price: {
		amount: 10,
		interval: BillingInterval.OneOff,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
	},
	expiry: EXPIRY,
};

/** Manual top-up only routes on a one-off prepaid item hosted by a RECURRING
 * plan, so the top-up case needs a base price. */
const expiringTopUpOnRecurringPlan = (planId: string) => ({
	plan_id: planId,
	name: "Expiring Top-Up Host",
	price: { amount: 20, interval: BillingInterval.Month },
	items: [expiringItem],
});

const expiringTopUpPlan = (planId: string) => ({
	plan_id: planId,
	name: "Expiring Top-Up",
	is_add_on: true,
	items: [
		{
			feature_id: TestFeature.Messages,
			included: 0,
			price: {
				amount: 10,
				interval: BillingInterval.OneOff,
				billing_method: BillingMethod.Prepaid,
				billing_units: 100,
			},
			expiry: EXPIRY,
		},
	],
});

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: expiry round-trips through catalogV2 and lands on the entitlement")}`,
	async () => {
		const planId = "expiry-catalog";
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });

		await autumnV2_3.catalogV2.update({ plans: [expiringTopUpPlan(planId)] });

		// ── Contract assertion 1: expiry is returned by catalogV2.get ──────────
		const catalog = await autumnV2_3.catalogV2.get();
		const plan = catalog.plans.find((p: { id: string }) => p.id === planId);
		expect(plan?.items?.[0]?.expiry).toEqual(EXPIRY);

		// ── Contract assertion 2: persisted onto the entitlement definition ────
		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const entitlement = fullProduct.entitlements.find(
			(ent) => ent.feature.id === TestFeature.Messages,
		);
		expect(entitlement?.expiry_duration).toBe(EntitlementDuration.Month);
		expect(entitlement?.expiry_length).toBe(2);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: rejected on a recurring item")}`,
	async () => {
		const { autumnV2_3 } = await initScenario({ setup: [], actions: [] });

		// ── Contract assertion 3: recurring + expiry is a 400 ──────────────────
		await expect(
			autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: "expiry-recurring",
						name: "Invalid",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
								price: {
									amount: 10,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.Prepaid,
									billing_units: 100,
								},
								expiry: EXPIRY,
							},
						],
					},
				],
			}),
		).rejects.toThrow();
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: attach puts the purchase in a grant row, keystone stays 0/0")}`,
	async () => {
		const planId = "expiry-attach";
		const customerId = "expiry-attach-cus";
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

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const customerProduct = fullCustomer.customer_products.find(
			(cp) => cp.product.id === planId,
		);
		const rows = (customerProduct?.customer_entitlements ?? []).filter(
			(ce) => ce.entitlement.feature.id === TestFeature.Messages,
		);

		// ── Contract assertion 4: two rows, one shared entitlement ────────────
		expect(rows.length).toBe(2);
		expect(new Set(rows.map((row) => row.entitlement_id)).size).toBe(1);

		// ── Contract assertion 5: keystone is pristine and never expires ──────
		const keystone = rows.find((row) => row.expires_at == null);
		expect(keystone).toBeDefined();
		expect(keystone?.balance).toBe(0);

		// ── Contract assertion 6: grant holds the purchase and expires ────────
		const grant = rows.find((row) => row.expires_at != null);
		expect(grant?.balance).toBe(100);
		expect(grant?.adjustment).toBe(100);
		expect(grant?.expires_at).toBeGreaterThan(Date.now());

		// ── Contract assertion 7: granted reports the purchase exactly once ───
		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].granted).toBe(100);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(100);

		// ── Contract assertion 8: the product is not marked custom ────────────
		expect(customerProduct?.is_custom).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: each top-up gets its own grant row and expiry")}`,
	async () => {
		const planId = "expiry-topup";
		const customerId = "expiry-topup-cus";
		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [expiringTopUpOnRecurringPlan(planId)],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});
		await autumnV2_2.subscriptions.update({
			customer_id: customerId,
			plan_id: planId,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const customerProduct = fullCustomer.customer_products.find(
			(cp) => cp.product.id === planId,
		);
		const grants = (customerProduct?.customer_entitlements ?? []).filter(
			(ce) =>
				ce.entitlement.feature.id === TestFeature.Messages &&
				ce.expires_at != null,
		);

		// ── Contract assertion 9: one grant row per purchase ──────────────────
		expect(grants.length).toBe(2);
		expect(
			grants
				.map((grant) => grant.balance)
				.sort((left, right) => (left ?? 0) - (right ?? 0)),
		).toEqual([100, 200]);

		// ── Contract assertion 10: still one entitlement, still not custom ────
		const entitlementIds = new Set(
			(customerProduct?.customer_entitlements ?? []).map(
				(row) => row.entitlement_id,
			),
		);
		expect(entitlementIds.size).toBe(1);
		expect(customerProduct?.is_custom).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: an auto top-up lands in its own expiring grant row")}`,
	async () => {
		const planId = "expiry-auto";
		const customerId = "expiry-auto-cus";
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

		await autumnV2_1.customers.update(customerId, {
			billing_controls: {
				auto_topups: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						threshold: 20,
						quantity: 100,
					},
				],
			},
		});

		// 100 - 85 = 15, below the threshold of 20 → auto top-up fires.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 85,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const customerProduct = fullCustomer.customer_products.find(
			(cp) => cp.product.id === planId,
		);
		const rows = (customerProduct?.customer_entitlements ?? []).filter(
			(ce) => ce.entitlement.feature.id === TestFeature.Messages,
		);
		const grants = rows.filter((row) => row.expires_at != null);

		// ── Contract assertion 11: the top-up created a SECOND grant ──────────
		expect(grants.length).toBe(2);
		expect(new Set(grants.map((grant) => grant.expires_at)).size).toBe(2);

		// ── Contract assertion 12: attach grant drained, top-up grant full ────
		expect(
			grants
				.map((grant) => grant.balance)
				.sort((left, right) => (left ?? 0) - (right ?? 0)),
		).toEqual([15, 100]);

		// ── Contract assertion 13: keystone untouched by the top-up ───────────
		const keystone = rows.find((row) => row.expires_at == null);
		expect(keystone?.balance).toBe(0);

		// ── Contract assertion 14: options NOT bumped — grants are the record ─
		const option = customerProduct?.options.find(
			(entry) => entry.feature_id === TestFeature.Messages,
		);
		expect(option?.quantity).toBe(1);

		// ── Contract assertion 15: balance reports one grant's worth added ────
		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(115);

		// ── Contract assertion 16: still one entitlement, still not custom ────
		expect(new Set(rows.map((row) => row.entitlement_id)).size).toBe(1);
		expect(customerProduct?.is_custom).toBe(false);
	},
);

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
				AND customer_product_id IS NOT NULL
				AND internal_customer_id = (
					SELECT internal_id FROM customers
					WHERE id = ${customerId}
						AND org_id = ${ctx.org.id}
						AND env = ${ctx.env}
				)
		`);
		await invalidateCachedFullSubject({ ctx, customerId });

		// ── Contract assertion 17: elapsed credits are not spendable ──────────
		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(after.balances[TestFeature.Messages]?.remaining ?? 0).toBe(0);

		// ── Contract assertion 18: the sweep deletes the elapsed row ──────────
		const { deleted } = await deleteExpiredGrants({ ctx });
		expect(deleted).toBeGreaterThan(0);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const customerProduct = fullCustomer.customer_products.find(
			(cp) => cp.product.id === planId,
		);
		const rows = (customerProduct?.customer_entitlements ?? []).filter(
			(ce) => ce.entitlement.feature.id === TestFeature.Messages,
		);
		expect(rows.every((row) => row.expires_at == null)).toBe(true);

		// ── Contract assertion 19: the keystone survives the sweep ────────────
		expect(rows.length).toBe(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: repeated top-ups each split into their own positive grant")}`,
	async () => {
		const planId = "expiry-multi";
		const customerId = "expiry-multi-cus";
		const { autumnV2_1, autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [expiringTopUpOnRecurringPlan(planId)],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});

		for (const quantity of [100, 200, 300]) {
			await autumnV2_2.subscriptions.update({
				customer_id: customerId,
				plan_id: planId,
				feature_quantities: [{ feature_id: TestFeature.Messages, quantity }],
			});
		}

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const customerProduct = fullCustomer.customer_products.find(
			(cp) => cp.product.id === planId,
		);
		const rows = (customerProduct?.customer_entitlements ?? []).filter(
			(ce) => ce.entitlement.feature.id === TestFeature.Messages,
		);
		const grants = rows.filter((row) => row.expires_at != null);

		// ── Contract assertion 20: attach + three top-ups = four grants ───────
		expect(grants.length).toBe(4);

		// ── Contract assertion 21: every grant kept its own purchase ──────────
		expect(
			grants
				.map((grant) => grant.balance)
				.sort((left, right) => (left ?? 0) - (right ?? 0)),
		).toEqual([100, 100, 200, 300]);

		// ── Contract assertion 22: none of them drained into another ──────────
		expect(grants.every((grant) => (grant.balance ?? 0) > 0)).toBe(true);
		expect(grants.every((grant) => (grant.expires_at ?? 0) > Date.now())).toBe(
			true,
		);

		// ── Contract assertion 23: one keystone, one entitlement, not custom ──
		expect(rows.filter((row) => row.expires_at == null).length).toBe(1);
		expect(new Set(rows.map((row) => row.entitlement_id)).size).toBe(1);
		expect(customerProduct?.is_custom).toBe(false);

		// ── Contract assertion 24: the customer can spend all of it ───────────
		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(700);
	},
);
