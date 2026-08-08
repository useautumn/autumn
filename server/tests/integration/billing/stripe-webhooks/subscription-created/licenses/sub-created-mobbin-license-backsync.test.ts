/** Parent-specific quarterly/yearly seat prices select their owning plan.
 * Stripe quantities create and update the pool without replacing its definition. */
import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type ApiEntityV2,
	BillingInterval,
} from "@autumn/shared";
import { createExternalStripeSubscription } from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { getProductStripeProductId } from "@tests/integration/billing/sync/utils/syncProductHelpers";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { billingActions } from "@/internal/billing/v2/actions";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import { ProductService } from "@/internal/products/ProductService";

const INCLUDED_SEATS = 0;
const INITIAL_PAID_SEATS = 3;
const UPDATED_PAID_SEATS = 4;
const SEAT_CREDITS = 600;

type AutumnV2_3 = Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];

const waitForLicensePool = async ({
	autumnV2_3,
	customerId,
	licensePlanId,
	parentPlanId,
	paidQuantity,
	usage,
}: {
	autumnV2_3: AutumnV2_3;
	customerId: string;
	licensePlanId: string;
	parentPlanId: string;
	paidQuantity: number;
	usage: number;
}) => {
	const deadline = Date.now() + 60_000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const customer =
				await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
			expectCustomerLicenses({
				customer,
				count: 1,
				licenses: [
					{
						license_plan_id: licensePlanId,
						parent_plan_id: parentPlanId,
						paid_quantity: paidQuantity,
						granted: INCLUDED_SEATS + paidQuantity,
						usage,
						remaining: INCLUDED_SEATS + paidQuantity - usage,
					},
				],
			});
			return;
		} catch (error) {
			lastError = error;
			await timeout(2_000);
		}
	}
	throw lastError;
};

const setupSharedCustomizedLicense = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const teamQuarterly = products.base({
		id: `${customerId}-team-quarterly`,
		items: [items.dashboard()],
	});
	const teamYearly = products.base({
		id: `${customerId}-team-yearly`,
		items: [items.dashboard()],
	});
	const teamSeat = products.base({
		id: `${customerId}-team-seat`,
		items: [
			items.monthlyPrice({ price: 10 }),
			items.monthlyCredits({ includedUsage: SEAT_CREDITS }),
		],
		group: `${customerId}-licenses`,
	});
	const { autumnV1, autumnV2_2, autumnV2_3 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [teamQuarterly, teamYearly, teamSeat] }),
		],
		actions: [],
	});

	await autumnV2_2.post("/plans.update", {
		plan_id: teamQuarterly.id,
		licenses: [
			{
				license_plan_id: teamSeat.id,
				included: INCLUDED_SEATS,
				customize: {
					price: { amount: 72, interval: BillingInterval.Quarter },
				},
			},
		],
	});
	await autumnV2_2.post("/plans.update", {
		plan_id: teamYearly.id,
		licenses: [
			{
				license_plan_id: teamSeat.id,
				included: INCLUDED_SEATS,
				customize: {
					price: { amount: 192, interval: BillingInterval.Year },
				},
			},
		],
	});

	const teamSeatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: teamSeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const stripeProductId = getProductStripeProductId({
		fullProduct: teamSeatFull,
	});
	const [quarterlyStripePrice, yearlyStripePrice] = await Promise.all([
		ctx.stripeCli.prices.create({
			product: stripeProductId,
			unit_amount: 72 * 100,
			currency: "usd",
			recurring: { interval: "month", interval_count: 3 },
		}),
		ctx.stripeCli.prices.create({
			product: stripeProductId,
			unit_amount: 192 * 100,
			currency: "usd",
			recurring: { interval: "year" },
		}),
	]);
	expect(quarterlyStripePrice.id).not.toBe(yearlyStripePrice.id);
	expect(quarterlyStripePrice.product).toBe(yearlyStripePrice.product);

	return {
		autumnV1,
		autumnV2_3,
		teamQuarterly,
		teamYearly,
		teamSeat,
		quarterlyStripePriceId: quarterlyStripePrice.id,
		yearlyStripePriceId: yearlyStripePrice.id,
	};
};

const updateSubscriptionQuantity = async ({
	subscription,
	stripePriceId,
	quantity,
}: {
	subscription: Stripe.Subscription;
	stripePriceId: string;
	quantity: number;
}) => {
	const item = subscription.items.data.find(
		(candidate) => candidate.price.id === stripePriceId,
	);
	if (!item) throw new Error(`Subscription has no item for ${stripePriceId}`);
	return ctx.stripeCli.subscriptions.update(subscription.id, {
		items: [{ id: item.id, quantity }],
		proration_behavior: "none",
	});
};

const runBacksyncCase = async ({
	customerId,
	interval,
}: {
	customerId: string;
	interval: BillingInterval.Quarter | BillingInterval.Year;
}) => {
	const family = await setupSharedCustomizedLicense({ customerId });
	const isYearly = interval === BillingInterval.Year;
	const parentPlan = isYearly ? family.teamYearly : family.teamQuarterly;
	const otherParentPlan = isYearly ? family.teamQuarterly : family.teamYearly;
	const stripePriceId = isYearly
		? family.yearlyStripePriceId
		: family.quarterlyStripePriceId;
	const amount = isYearly ? 192 : 72;

	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: stripePriceId, quantity: INITIAL_PAID_SEATS }],
	});
	await waitForLicensePool({
		autumnV2_3: family.autumnV2_3,
		customerId,
		licensePlanId: family.teamSeat.id,
		parentPlanId: parentPlan.id,
		paidQuantity: INITIAL_PAID_SEATS,
		usage: 0,
	});
	await timeout(2_000);
	const proposal = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
	});
	await billingActions.syncV2({
		ctx,
		params: proposal.params,
		tags: ["mobbin-integration-test"],
	});
	await billingActions.syncV2({
		ctx,
		params: proposal.params,
		tags: ["mobbin-integration-test"],
	});
	await waitForLicensePool({
		autumnV2_3: family.autumnV2_3,
		customerId,
		licensePlanId: family.teamSeat.id,
		parentPlanId: parentPlan.id,
		paidQuantity: INITIAL_PAID_SEATS,
		usage: 0,
	});

	const customer =
		await family.autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: parentPlan.id });
	await expectProductNotPresent({ customer, productId: otherParentPlan.id });
	const definitionBefore = await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parentPlan.id,
		subscriptionId: subscription.id,
		isCustom: false,
		basePrice: { amount, interval },
	});

	const entityId = `${customerId}-member`;
	await family.autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: family.teamSeat.id,
		entities: [{ entity_id: entityId, name: "Member", feature_id: "users" }],
	});
	const entity = await family.autumnV2_3.entities.get<ApiEntityV2>(
		customerId,
		entityId,
	);
	expect(entity.balances.credits).toMatchObject({
		remaining: SEAT_CREDITS,
		usage: 0,
	});
	const workspace =
		await family.autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expect(workspace.balances.credits).toBeUndefined();

	await updateSubscriptionQuantity({
		subscription,
		stripePriceId,
		quantity: UPDATED_PAID_SEATS,
	});
	await waitForLicensePool({
		autumnV2_3: family.autumnV2_3,
		customerId,
		licensePlanId: family.teamSeat.id,
		parentPlanId: parentPlan.id,
		paidQuantity: UPDATED_PAID_SEATS,
		usage: 1,
	});
	const definitionAfter = await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parentPlan.id,
		subscriptionId: subscription.id,
		isCustom: false,
		basePrice: { amount, interval },
	});
	expect(definitionAfter.id).toBe(definitionBefore.id);
};

test(`${chalk.yellowBright("Mobbin Team back-sync: quarterly price selects Team Quarterly and syncs seats")}`, async () => {
	await runBacksyncCase({
		customerId: "mobbin-team-quarterly-sync",
		interval: BillingInterval.Quarter,
	});
});

test(`${chalk.yellowBright("Mobbin Team back-sync: yearly price selects Team Yearly and syncs seats")}`, async () => {
	await runBacksyncCase({
		customerId: "mobbin-team-yearly-sync",
		interval: BillingInterval.Year,
	});
});

test(`${chalk.yellowBright("Mobbin Enterprise back-sync: Enterprise Seat never resolves to Team")}`, async () => {
	const customerId = "mobbin-enterprise-seat-sync";
	const team = products.base({
		id: `${customerId}-team`,
		items: [items.dashboard()],
	});
	const enterprise = products.base({
		id: `${customerId}-enterprise`,
		items: [items.dashboard()],
	});
	const teamSeat = products.base({
		id: `${customerId}-team-seat`,
		items: [items.monthlyCredits({ includedUsage: SEAT_CREDITS })],
		group: `${customerId}-team-licenses`,
	});
	const enterpriseSeat = products.base({
		id: `${customerId}-enterprise-seat`,
		items: [items.monthlyCredits({ includedUsage: SEAT_CREDITS })],
		group: `${customerId}-enterprise-licenses`,
	});
	const { autumnV1, autumnV2_2, autumnV2_3 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [team, enterprise, teamSeat, enterpriseSeat] }),
		],
		actions: [],
	});

	await autumnV2_2.post("/plans.update", {
		plan_id: team.id,
		licenses: [
			{
				license_plan_id: teamSeat.id,
				included: 0,
				customize: {
					price: { amount: 192, interval: BillingInterval.Year },
				},
			},
		],
	});
	await autumnV2_2.post("/plans.update", {
		plan_id: enterprise.id,
		licenses: [
			{
				license_plan_id: enterpriseSeat.id,
				included: 0,
				customize: {
					price: { amount: 400, interval: BillingInterval.Year },
				},
			},
		],
	});
	const enterpriseSeatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: enterpriseSeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const stripePrice = await ctx.stripeCli.prices.create({
		product: getProductStripeProductId({ fullProduct: enterpriseSeatFull }),
		unit_amount: 400 * 100,
		currency: "usd",
		recurring: { interval: "year" },
	});
	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: stripePrice.id, quantity: 2 }],
	});

	await waitForLicensePool({
		autumnV2_3,
		customerId,
		licensePlanId: enterpriseSeat.id,
		parentPlanId: enterprise.id,
		paidQuantity: 2,
		usage: 0,
	});
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: enterprise.id });
	await expectProductNotPresent({ customer, productId: team.id });
	await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: enterprise.id,
		subscriptionId: subscription.id,
		isCustom: false,
		basePrice: { amount: 400, interval: BillingInterval.Year },
	});
});
