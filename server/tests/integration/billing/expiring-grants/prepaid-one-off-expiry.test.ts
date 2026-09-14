/**
 * Expiring prepaid one-off plan items.
 *
 * Contract under test:
 *   New fields:
 *     - plan item `expiry: { duration: EntitlementDuration, length: number }`
 *       persisted to entitlements.expiry_duration / expiry_length
 *     - customer_entitlements.metadata `{ source, plan_id, customer_product_id }`
 *   New behaviors:
 *     - attach with quantity N  -> keystone cus_ent on the product (balance 0,
 *                                  expires_at null, the charge source)
 *                               -> LOOSE grant cus_ent (balance N, adjustment N,
 *                                  expires_at stamped, metadata.source = attach)
 *     - manual top-up           -> one more loose grant, source = manual_topup
 *     - auto top-up             -> one more loose grant, source = auto_topup,
 *                                  options NOT bumped, cache refreshed
 *     - repeated top-ups        -> one grant per purchase, none merged
 *     - churn                   -> grants outlive the plan (loose rows)
 *     - upgrade / downgrade     -> a live, partly used grant carries over
 *                                  unchanged, on top of the new plan's grant
 *     - persist_free_overage    -> the grant is split BEFORE the overage
 *                                  rebalance zeroes the one-off row
 *     - elapsed grant           -> leaves the balance; the sweep deletes it
 *     - expiry on a recurring / non-prepaid item -> 400
 *     - cusProduct.is_custom stays false (grants have their own entitlement)
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	BillingMethod,
	CusProductStatus,
	EntitlementDuration,
	type FullCustomer,
	ms,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
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

const expiringTopUpPlan = (planId: string) => ({
	plan_id: planId,
	name: "Expiring Top-Up",
	add_on: true,
	items: [expiringItem],
});

/** Manual top-up only routes on a one-off prepaid item hosted by a RECURRING
 * plan, so the top-up cases need a base price. */
const expiringTopUpOnRecurringPlan = (planId: string) => ({
	plan_id: planId,
	name: "Expiring Top-Up Host",
	price: { amount: 20, interval: BillingInterval.Month },
	items: [expiringItem],
});

const messageRows = ({
	fullCustomer,
	planId,
}: {
	fullCustomer: FullCustomer;
	planId: string;
}) => {
	const customerProduct = fullCustomer.customer_products.find(
		(cp) => cp.product.id === planId,
	);
	const keystones = (customerProduct?.customer_entitlements ?? []).filter(
		(ce) => ce.entitlement.feature.id === TestFeature.Messages,
	);
	const grants = fullCustomer.extra_customer_entitlements.filter(
		(ce) =>
			ce.entitlement.feature.id === TestFeature.Messages &&
			ce.metadata?.source != null,
	);
	return { customerProduct, keystones, grants };
};

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: expiry round-trips through catalogV2 and lands on the entitlement")}`,
	async () => {
		const planId = "expiry-catalog";
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });

		await autumnV2_3.catalogV2.update({ plans: [expiringTopUpPlan(planId)] });

		const catalog = await autumnV2_3.catalogV2.get();
		const plan = catalog.plans.find((p: { id: string }) => p.id === planId);
		expect(plan?.items?.[0]?.expiry).toEqual(EXPIRY);

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
	`${chalk.yellowBright("prepaid one-off expiry: attach puts the purchase in a loose grant, keystone stays 0/0")}`,
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
			withEntities: true,
		});
		const { customerProduct, keystones, grants } = messageRows({
			fullCustomer,
			planId,
		});

		// keystone: the plan's own row, pristine and never expiring
		expect(keystones.length).toBe(1);
		expect(keystones[0].balance).toBe(0);
		expect(keystones[0].expires_at).toBeNull();

		// grant: loose, holds the purchase, stamped
		expect(grants.length).toBe(1);
		const grant = grants[0];
		expect(grant.customer_product_id).toBeNull();
		expect(grant.balance).toBe(100);
		expect(grant.entitlement.allowance).toBe(100);
		expect(grant.expires_at).toBeGreaterThan(Date.now());
		expect(grant.metadata).toEqual({
			source: "attach",
			plan_id: planId,
			customer_product_id: customerProduct?.id,
		});
		expect(grant.entitlement_id).not.toBe(keystones[0].entitlement_id);

		// reporting: purchase counted exactly once
		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].granted).toBe(100);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(100);
		expect(customer.balances[TestFeature.Messages].usage).toBe(0);

		expect(customerProduct?.is_custom).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: each manual top-up gets its own loose grant")}`,
	async () => {
		const planId = "expiry-topup";
		const customerId = "expiry-topup-cus";
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
			withEntities: true,
		});
		const { customerProduct, keystones, grants } = messageRows({
			fullCustomer,
			planId,
		});

		// attach + three top-ups = four grants, none merged
		expect(grants.length).toBe(4);
		expect(
			grants
				.map((grant) => grant.balance)
				.sort((left, right) => (left ?? 0) - (right ?? 0)),
		).toEqual([100, 100, 200, 300]);
		expect(grants.every((grant) => (grant.balance ?? 0) > 0)).toBe(true);
		expect(grants.every((grant) => (grant.expires_at ?? 0) > Date.now())).toBe(
			true,
		);
		expect(
			grants.filter((grant) => grant.metadata?.source === "manual_topup")
				.length,
		).toBe(3);

		// keystone untouched, product not custom
		expect(keystones.length).toBe(1);
		expect(keystones[0].balance).toBe(0);
		expect(customerProduct?.is_custom).toBe(false);

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(700);
		expect(customer.balances[TestFeature.Messages].granted).toBe(700);
		expect(customer.balances[TestFeature.Messages].usage).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: an auto top-up lands in its own loose grant")}`,
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
			withEntities: true,
		});
		const { customerProduct, keystones, grants } = messageRows({
			fullCustomer,
			planId,
		});

		// the top-up created a SECOND grant with its own expiry
		expect(grants.length).toBe(2);
		expect(new Set(grants.map((grant) => grant.expires_at)).size).toBe(2);
		expect(
			grants
				.map((grant) => grant.balance)
				.sort((left, right) => (left ?? 0) - (right ?? 0)),
		).toEqual([15, 100]);
		expect(
			grants.find((grant) => grant.balance === 100)?.metadata?.source,
		).toBe("auto_topup");

		// keystone untouched, options NOT bumped
		expect(keystones[0].balance).toBe(0);
		expect(
			customerProduct?.options.find(
				(entry) => entry.feature_id === TestFeature.Messages,
			)?.quantity,
		).toBe(1);

		// the cache saw the new row
		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(115);
		expect(customerProduct?.is_custom).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: grants outlive the plan on churn")}`,
	async () => {
		const planId = "expiry-churn";
		const customerId = "expiry-churn-cus";
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

		await autumnV2_2.subscriptions.update({
			customer_id: customerId,
			plan_id: planId,
			cancel_action: "cancel_immediately",
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const { grants } = messageRows({ fullCustomer, planId });

		// the plan is gone; the purchased credits are not
		expect(grants.length).toBe(1);
		expect(grants[0].balance).toBe(100);
		expect(grants[0].metadata?.plan_id).toBe(planId);

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages]?.remaining).toBe(100);
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

const expiringPro = (planId: string) => ({
	plan_id: planId,
	name: "Expiring Pro",
	price: { amount: 20, interval: BillingInterval.Month },
	items: [expiringItem],
});

const plainPremium = (planId: string) => ({
	plan_id: planId,
	name: "Plain Premium",
	price: { amount: 50, interval: BillingInterval.Month },
	items: [
		{
			feature_id: TestFeature.Messages,
			included: 500,
			reset: { interval: ResetInterval.Month },
		},
	],
});

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: a partly used grant survives an upgrade with its expiry")}`,
	async () => {
		const proId = "expiry-up-pro";
		const premiumId = "expiry-up-premium";
		const customerId = "expiry-upgrade-cus";
		const { autumnV2_1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [expiringPro(proId), plainPremium(premiumId)],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: proId,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		// Burn 50 of the 200 → the grant sits at 150.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await timeout(2000);

		const beforeGrant = messageRows({
			fullCustomer: await CusService.getFull({
				ctx,
				idOrInternalId: customerId,
				withEntities: true,
			}),
			planId: proId,
		}).grants[0];
		expect(beforeGrant.balance).toBe(150);

		// ── act: upgrade to premium (500 included, no expiring item)
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: premiumId,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const { grants } = messageRows({ fullCustomer, planId: proId });

		// the grant is the SAME row, untouched: same id, same balance, same expiry
		expect(grants.length).toBe(1);
		expect(grants[0].id).toBe(beforeGrant.id);
		expect(grants[0].balance).toBe(150);
		expect(grants[0].expires_at).toBe(beforeGrant.expires_at);
		expect(grants[0].metadata?.plan_id).toBe(proId);

		// 500 from premium + 150 carried = 650 spendable; the 50 already spent
		// is still real usage against the 200 originally purchased.
		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(650);
		expect(customer.balances[TestFeature.Messages].granted).toBe(700);
		expect(customer.balances[TestFeature.Messages].usage).toBe(50);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: a partly used grant survives a downgrade with its expiry")}`,
	async () => {
		const premiumId = "expiry-down-premium";
		const proId = "expiry-down-pro";
		const customerId = "expiry-downgrade-cus";
		const { autumnV2_1, autumnV2_3, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [s.customer({ paymentMethod: "success", testClock: true })],
				actions: [],
			});

		// premium is the expiring host here so the grant exists before we step down
		await autumnV2_3.catalogV2.update({
			plans: [
				{
					...expiringPro(premiumId),
					name: "Expiring Premium",
					price: { amount: 50, interval: BillingInterval.Month },
				},
				{
					...plainPremium(proId),
					name: "Plain Pro",
					price: { amount: 20, interval: BillingInterval.Month },
				},
			],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: premiumId,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await timeout(2000);

		const beforeGrant = messageRows({
			fullCustomer: await CusService.getFull({
				ctx,
				idOrInternalId: customerId,
				withEntities: true,
			}),
			planId: premiumId,
		}).grants[0];
		expect(beforeGrant.balance).toBe(150);

		// ── act: downgrade to the cheaper plan. A cheaper plan is scheduled for
		// end of cycle, so premium stays live now and pro takes over at renewal.
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: proId,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const { grants } = messageRows({ fullCustomer, planId: premiumId });

		// the grant is untouched by the scheduling
		expect(grants.length).toBe(1);
		expect(grants[0].id).toBe(beforeGrant.id);
		expect(grants[0].balance).toBe(150);
		expect(grants[0].expires_at).toBe(beforeGrant.expires_at);

		const scheduled = fullCustomer.customer_products.find(
			(cp) => cp.product.id === proId,
		);
		expect(scheduled?.status).toBe(CusProductStatus.Scheduled);

		// still spendable today; the plain plan's 500 only arrives at renewal
		const beforeRenewal =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(beforeRenewal.balances[TestFeature.Messages].remaining).toBe(150);

		// ── advance past the cycle boundary so the scheduled plan activates
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: advancedTo + ms.days(35),
			waitForSeconds: 30,
		});

		const afterRenewal = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		expect(
			afterRenewal.customer_products.find((cp) => cp.product.id === proId)
				?.status,
		).toBe(CusProductStatus.Active);

		// the grant survived the completed transition, byte for byte
		const survivors = messageRows({
			fullCustomer: afterRenewal,
			planId: premiumId,
		}).grants;
		expect(survivors.length).toBe(1);
		expect(survivors[0].id).toBe(beforeGrant.id);
		expect(survivors[0].balance).toBe(150);
		expect(survivors[0].expires_at).toBe(beforeGrant.expires_at);

		// 500 from the plain plan + 150 carried
		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(650);
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
