/** Contract: parent-specific monthly/annual Dev Seat prices share its Stripe product and each selects only its owning parent on sub.created.
 * A later Stripe quantity update converges that parent's existing license pool without replacing its catalog definition. */
import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	BillingInterval,
} from "@autumn/shared";
import { createExternalStripeSubscription } from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import {
	createStripeFixedPriceUnderProduct,
	getProductStripeProductId,
} from "@tests/integration/billing/sync/utils/syncProductHelpers";
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
import { ProductService } from "@/internal/products/ProductService";

const INCLUDED_SEATS = 1;
const INITIAL_PAID_SEATS = 2;
const UPDATED_PAID_SEATS = 4;

type AutumnV2_3 = Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];

const waitForLicensePool = async ({
	autumnV2_3,
	customerId,
	licensePlanId,
	parentPlanId,
	paidQuantity,
}: {
	autumnV2_3: AutumnV2_3;
	customerId: string;
	licensePlanId: string;
	parentPlanId: string;
	paidQuantity: number;
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
						usage: 0,
						remaining: INCLUDED_SEATS + paidQuantity,
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
	const pro = products.base({
		id: `${customerId}-pro`,
		items: [items.dashboard()],
	});
	const proAnnual = products.base({
		id: `${customerId}-pro-annual`,
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: `${customerId}-dev-seat`,
		items: [
			items.monthlyPrice({ price: 10 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
		group: `${customerId}-licenses`,
	});
	const { autumnV1, autumnV2_2, autumnV2_3 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, proAnnual, devSeat] }),
		],
		actions: [],
	});

	await autumnV2_2.post("/plans.update", {
		plan_id: pro.id,
		licenses: [
			{
				license_plan_id: devSeat.id,
				included: INCLUDED_SEATS,
				customize: {
					price: { amount: 20, interval: BillingInterval.Month },
				},
			},
		],
	});
	await autumnV2_2.post("/plans.update", {
		plan_id: proAnnual.id,
		licenses: [
			{
				license_plan_id: devSeat.id,
				included: INCLUDED_SEATS,
				customize: {
					price: { amount: 200, interval: BillingInterval.Year },
				},
			},
		],
	});

	const devSeatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: devSeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const stripeProductId = getProductStripeProductId({
		fullProduct: devSeatFull,
	});
	const [monthlyStripePrice, annualStripePrice] = await Promise.all([
		createStripeFixedPriceUnderProduct({
			ctx,
			stripeProductId,
			unitAmount: 20 * 100,
			interval: "month",
		}),
		createStripeFixedPriceUnderProduct({
			ctx,
			stripeProductId,
			unitAmount: 200 * 100,
			interval: "year",
		}),
	]);
	expect(monthlyStripePrice.id).not.toBe(annualStripePrice.id);
	expect(monthlyStripePrice.product).toBe(annualStripePrice.product);

	return {
		autumnV1,
		autumnV2_3,
		pro,
		proAnnual,
		devSeat,
		monthlyStripePriceId: monthlyStripePrice.id,
		annualStripePriceId: annualStripePrice.id,
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
	await ctx.stripeCli.subscriptions.update(subscription.id, {
		items: [{ id: item.id, quantity }],
		proration_behavior: "none",
	});
};

const runBacksyncCase = async ({
	customerId,
	interval,
}: {
	customerId: string;
	interval: BillingInterval.Month | BillingInterval.Year;
}) => {
	const family = await setupSharedCustomizedLicense({ customerId });
	const isAnnual = interval === BillingInterval.Year;
	const parentPlan = isAnnual ? family.proAnnual : family.pro;
	const otherParentPlan = isAnnual ? family.pro : family.proAnnual;
	const stripePriceId = isAnnual
		? family.annualStripePriceId
		: family.monthlyStripePriceId;
	const amount = isAnnual ? 200 : 20;

	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: stripePriceId, quantity: INITIAL_PAID_SEATS }],
	});
	await waitForLicensePool({
		autumnV2_3: family.autumnV2_3,
		customerId,
		licensePlanId: family.devSeat.id,
		parentPlanId: parentPlan.id,
		paidQuantity: INITIAL_PAID_SEATS,
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

	await updateSubscriptionQuantity({
		subscription,
		stripePriceId,
		quantity: UPDATED_PAID_SEATS,
	});
	await waitForLicensePool({
		autumnV2_3: family.autumnV2_3,
		customerId,
		licensePlanId: family.devSeat.id,
		parentPlanId: parentPlan.id,
		paidQuantity: UPDATED_PAID_SEATS,
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

test(`${chalk.yellowBright("shared customized license back-sync: monthly price selects Pro and syncs quantity")}`, async () => {
	await runBacksyncCase({
		customerId: "sub-shared-custom-license-monthly",
		interval: BillingInterval.Month,
	});
});

test(`${chalk.yellowBright("shared customized license back-sync: annual price selects Pro Annual and syncs quantity")}`, async () => {
	await runBacksyncCase({
		customerId: "sub-shared-custom-license-annual",
		interval: BillingInterval.Year,
	});
});
