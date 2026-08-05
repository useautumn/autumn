/**
 * Contract: a customer product may carry entitlement rows owned by a DIFFERENT
 * product than the one it points at — grandfathered rows survive a plan version
 * bump, and a regenerated custom price is stamped with the customer product's
 * own `internal_product_id`. Every billing operation must still resolve the
 * price → entitlement pair and leave Stripe consistent with Autumn.
 *
 * Shape reproduced here (from a reported production customer):
 *  - a custom customer product on the current plan,
 *  - a pay-per-use in-arrear item whose price AND entitlement are both owned by
 *    a superseded plan (they agree with each other; only the customer product
 *    has moved on),
 *  - a fixed monthly price owned by the current plan.
 *
 * Before the `priceToEnt` fix, `update` 404'd with
 * `createStripeInArrearPrice: feature not found for price pr_...`. These cases
 * cover the other operations that walk the same resolution path.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { queryRows } from "@tests/integration/balances/utils/usage-limit-utils/usageWindowDbTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { sql } from "drizzle-orm";

const CREDITS_PRICE_PER_UNIT = 0.01;
const BASE_PRICE = 20;

const creditsItem = ({ price }: { price: number }) =>
	items.consumable({
		featureId: TestFeature.Credits,
		includedUsage: 0,
		price,
	});

/** Pay-per-use credits + a fixed base price — the priced pair that has to
 * resolve across the product boundary. */
const planItems = () => [
	creditsItem({ price: CREDITS_PRICE_PER_UNIT }),
	items.monthlyPrice({ price: BASE_PRICE }),
];

const buildPlans = ({ suffix }: { suffix: string }) => ({
	plan: products.base({ id: `plan-${suffix}`, items: planItems() }),
	// Stands in for the superseded version that still owns the grandfathered rows.
	supersededPlan: products.base({
		id: `superseded-${suffix}`,
		items: [items.monthlyCredits({ includedUsage: 10_000 })],
	}),
	upgradePlan: products.base({
		id: `upgrade-${suffix}`,
		items: [
			creditsItem({ price: CREDITS_PRICE_PER_UNIT }),
			items.monthlyPrice({ price: 150 }),
		],
	}),
});

const internalProductId = async ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}) =>
	queryRows(
		await ctx.db.execute(sql`
			SELECT internal_id FROM products
			WHERE id = ${productId} AND org_id = ${ctx.org.id} AND env = ${ctx.env}
			LIMIT 1
		`),
	)[0]?.internal_id as string | undefined;

const activeCreditsRow = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) =>
	queryRows(
		await ctx.db.execute(sql`
			SELECT
				customer_product.internal_product_id AS customer_product_internal_product_id,
				entitlement.id AS entitlement_id,
				entitlement.internal_product_id AS entitlement_internal_product_id,
				price.id AS price_id
			FROM customer_entitlements customer_entitlement
			JOIN customer_products customer_product
				ON customer_product.id = customer_entitlement.customer_product_id
			JOIN customers customer
				ON customer.internal_id = customer_product.internal_customer_id
			JOIN entitlements entitlement
				ON entitlement.id = customer_entitlement.entitlement_id
			LEFT JOIN prices price
				ON price.entitlement_id = entitlement.id
			WHERE customer.id = ${customerId}
				AND customer.org_id = ${ctx.org.id}
				AND customer.env = ${ctx.env}
				AND customer_product.status = 'active'
				AND entitlement.feature_id = ${TestFeature.Credits}
			LIMIT 1
		`),
	)[0];

/**
 * Attach the plan as a custom subscription, then hand its priced credits pair
 * over to the superseded plan so the customer product straddles two products —
 * the reported production shape.
 *
 * `initScenario` prefixes product ids in place, so `plan.id` and friends are
 * already fully qualified once it resolves.
 */
const initCrossProductScenario = async ({
	customerId,
	suffix,
}: {
	customerId: string;
	suffix: string;
}) => {
	const { plan, supersededPlan, upgradePlan } = buildPlans({ suffix });

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan, supersededPlan, upgradePlan] }),
		],
		actions: [s.billing.attach({ productId: plan.id, items: planItems() })],
	});

	const { ctx } = scenario;

	const supersededInternalId = await internalProductId({
		ctx,
		productId: supersededPlan.id,
	});
	expect(supersededInternalId).toBeTruthy();

	const creditsRow = await activeCreditsRow({ ctx, customerId });
	expect(creditsRow?.entitlement_id).toBeTruthy();
	expect(creditsRow?.price_id).toBeTruthy();

	await ctx.db.execute(sql`
		UPDATE entitlements SET internal_product_id = ${supersededInternalId}
		WHERE id = ${creditsRow.entitlement_id}
	`);
	await ctx.db.execute(sql`
		UPDATE prices SET internal_product_id = ${supersededInternalId}
		WHERE id = ${creditsRow.price_id}
	`);

	// The straddle is real before any operation runs.
	const straddled = await activeCreditsRow({ ctx, customerId });
	expect(straddled.entitlement_internal_product_id).toBe(supersededInternalId);
	expect(straddled.entitlement_internal_product_id).not.toBe(
		straddled.customer_product_internal_product_id,
	);

	return { ...scenario, plan, supersededPlan, upgradePlan, creditsRow };
};

/** Runs the production `/billing.verify` action: every Stripe subscription must
 * match the state derived from the customer's products. The strongest
 * "no billing errors" signal available. */
const expectBillingConsistent = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => await expectStripeSubscriptionCorrect({ ctx, customerId });

test.concurrent(
	`${chalk.yellowBright("cross-product ents: update reprices the straddled usage item")}`,
	async () => {
		const customerId = "xprod-update";
		const { autumnV1, ctx, plan, creditsRow } = await initCrossProductScenario({
			customerId,
			suffix: "update",
		});

		// Repricing the usage item is what regenerates its custom price; the
		// unchanged entitlement is carried over still owned by the superseded plan.
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			items: [
				{
					...creditsItem({ price: CREDITS_PRICE_PER_UNIT * 2 }),
					entitlement_id: creditsRow.entitlement_id,
					price_id: creditsRow.price_id,
				},
				items.monthlyPrice({ price: 150 }),
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({ customer, count: 2 });
		await expectBillingConsistent({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("cross-product ents: attach a different plan over it")}`,
	async () => {
		const customerId = "xprod-attach";
		const { autumnV2_2, autumnV1, ctx, upgradePlan } =
			await initCrossProductScenario({
				customerId,
				suffix: "attach",
			});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: upgradePlan.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(
			customer.products?.some((product) => product.id === upgradePlan.id),
		).toBe(true);
		await expectBillingConsistent({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("cross-product ents: cancel end-of-cycle then uncancel")}`,
	async () => {
		const customerId = "xprod-cancel";
		const { autumnV1, ctx, plan } = await initCrossProductScenario({
			customerId,
			suffix: "cancel",
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const canceling = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(
			canceling.products?.find((product) => product.id === plan.id)
				?.canceled_at,
		).toBeTruthy();
		await expectBillingConsistent({ ctx, customerId });

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			cancel_action: "uncancel",
		});

		const uncanceled = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(
			uncanceled.products?.find((product) => product.id === plan.id)
				?.canceled_at,
		).toBeFalsy();
		await expectBillingConsistent({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("cross-product ents: createSchedule phases the plan forward")}`,
	async () => {
		const customerId = "xprod-schedule";
		const { autumnV1, plan, upgradePlan, advancedTo } =
			await initCrossProductScenario({
				customerId,
				suffix: "schedule",
			});

		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: plan.id }],
				},
				{
					starts_at: addMonths(new Date(advancedTo), 1).getTime(),
					plans: [{ plan_id: upgradePlan.id }],
				},
			],
		});

		// Deliberately not asserting expectStripeSubscriptionCorrect here: this
		// flow reports an `unexpected_schedule` mismatch even with no cross-product
		// rows at all (verified against a plain plan), so it would assert a
		// pre-existing gap rather than anything this contract covers.
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(
			customer.products?.some((product) => product.id === upgradePlan.id),
		).toBe(true);
	},
);
