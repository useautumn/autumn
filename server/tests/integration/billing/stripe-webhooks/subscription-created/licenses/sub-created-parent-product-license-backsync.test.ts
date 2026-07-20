/** Contract: customized license prices use the license plan's Stripe Product.
 * Back-sync resolves exact prices first, then unambiguous license price shapes. */
import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	BillingInterval,
	productToBasePrice,
} from "@autumn/shared";
import { createExternalStripeSubscription } from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { createStripeFixedPriceUnderProduct } from "@tests/integration/billing/sync/utils/syncProductHelpers";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { createVariantPlan } from "@tests/integration/crud/plans/variants/utils/variantTestPlanUtils";
import { getFullLicenseProduct } from "@tests/integration/licenses/catalog-update/utils/getFullLicenseProduct";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import testCtx, {
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import type { AutumnInt } from "@/external/autumn/autumnCli";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";
import { ProductService } from "@/internal/products/ProductService";

const INCLUDED_SEATS = 1;
const INITIAL_PAID_SEATS = 2;
const UPDATED_PAID_SEATS = 4;

type Scenario = {
	ctx: TestContext;
	autumnV2_2: AutumnInt;
	autumnV2_3: AutumnInt;
};

const stripeProductId = ({ price }: { price: Stripe.Price }) =>
	typeof price.product === "string" ? price.product : price.product.id;

const expectCustomizedPriceUnderLicenseProduct = async ({
	ctx,
	parentPlanId,
	licensePlanId,
}: {
	ctx: Scenario["ctx"];
	parentPlanId: string;
	licensePlanId: string;
}) => {
	const customized = await getFullLicenseProduct({
		ctx,
		parentPlanId,
		licensePlanId,
	});
	const price = productToBasePrice({
		product: customized.fullLicenseProduct,
	});
	const licenseStripeProductId = customized.fullLicenseProduct.processor?.id;
	if (!licenseStripeProductId) {
		throw new Error(`License ${licensePlanId} has no Stripe product`);
	}

	expect(customized.planLicense.customized).toBe(true);
	expect(price?.is_custom).toBe(true);
	expect(price?.config.stripe_product_id).toBe(licenseStripeProductId);
	expect(price?.config.stripe_price_id).toBeDefined();

	const stripePrice = await ctx.stripeCli.prices.retrieve(
		price!.config.stripe_price_id!,
	);
	expect(stripeProductId({ price: stripePrice })).toBe(licenseStripeProductId);

	return {
		price: price!,
		stripePrice,
		stripePriceId: stripePrice.id,
		stripeProductId: licenseStripeProductId,
	};
};

const waitForLicensePool = async ({
	scenario,
	customerId,
	parentPlanId,
	licensePlanId,
	paidQuantity,
}: {
	scenario: Scenario;
	customerId: string;
	parentPlanId: string;
	licensePlanId: string;
	paidQuantity: number;
}) => {
	const deadline = Date.now() + 60_000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const customer =
				await scenario.autumnV2_3.customers.get<ApiCustomerV5>(customerId);
			expectCustomerLicenses({
				customer,
				count: 1,
				licenses: [
					{
						license_plan_id: licensePlanId,
						parent_plan_id: parentPlanId,
						paid_quantity: paidQuantity,
						granted: INCLUDED_SEATS + paidQuantity,
					},
				],
			});
			return customer;
		} catch (error) {
			lastError = error;
			await timeout(2_000);
		}
	}
	throw lastError;
};

const customizeLicensePrice = async ({
	scenario,
	parentPlanId,
	licensePlanId,
	amount,
	interval,
}: {
	scenario: Scenario;
	parentPlanId: string;
	licensePlanId: string;
	amount: number;
	interval: BillingInterval.Month | BillingInterval.Year;
}) => {
	await scenario.autumnV2_2.post("/plans.update", {
		plan_id: parentPlanId,
		licenses: [
			{
				license_plan_id: licensePlanId,
				included: INCLUDED_SEATS,
				customize: { price: { amount, interval } },
			},
		],
	});
};

const createLicenseSubscription = async ({
	scenario,
	customerId,
	stripePriceId,
}: {
	scenario: Scenario;
	customerId: string;
	stripePriceId: string;
}) =>
	createExternalStripeSubscription({
		ctx: scenario.ctx,
		customerId,
		items: [{ price: stripePriceId, quantity: INITIAL_PAID_SEATS }],
	});

test(`${chalk.yellowBright("license back-sync: equal shapes under one license product select by exact price")}`, async () => {
	const customerId = "sub-license-parent-product-distinct";
	const parentA = products.base({
		id: `${customerId}-a`,
		items: [items.dashboard()],
	});
	const parentB = products.base({
		id: `${customerId}-b`,
		items: [items.dashboard()],
	});
	const teamSeat = products.base({
		id: `${customerId}-seat`,
		items: [items.monthlyPrice({ price: 5 })],
		group: `${customerId}-licenses`,
	});
	const scenario = await initScenario({
		customerId,
		ctx: testCtx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [parentA, parentB, teamSeat] }),
		],
		actions: [],
	});

	await customizeLicensePrice({
		scenario,
		parentPlanId: parentA.id,
		licensePlanId: teamSeat.id,
		amount: 12,
		interval: BillingInterval.Month,
	});
	await customizeLicensePrice({
		scenario,
		parentPlanId: parentB.id,
		licensePlanId: teamSeat.id,
		amount: 12,
		interval: BillingInterval.Month,
	});

	const [customA, customB] = await Promise.all([
		expectCustomizedPriceUnderLicenseProduct({
			ctx: scenario.ctx,
			parentPlanId: parentA.id,
			licensePlanId: teamSeat.id,
		}),
		expectCustomizedPriceUnderLicenseProduct({
			ctx: scenario.ctx,
			parentPlanId: parentB.id,
			licensePlanId: teamSeat.id,
		}),
	]);
	expect(customA.stripeProductId).toBe(customB.stripeProductId);
	expect(customA.stripePriceId).not.toBe(customB.stripePriceId);

	const subscription = await createLicenseSubscription({
		scenario,
		customerId,
		stripePriceId: customB.stripePriceId,
	});
	let customer = await waitForLicensePool({
		scenario,
		customerId,
		parentPlanId: parentB.id,
		licensePlanId: teamSeat.id,
		paidQuantity: INITIAL_PAID_SEATS,
	});
	await expectProductActive({ customer, productId: parentB.id });
	await expectProductNotPresent({ customer, productId: parentA.id });

	await scenario.ctx.stripeCli.subscriptions.update(subscription.id, {
		items: [
			{
				id: subscription.items.data[0]!.id,
				quantity: UPDATED_PAID_SEATS,
			},
		],
		proration_behavior: "none",
	});
	customer = await waitForLicensePool({
		scenario,
		customerId,
		parentPlanId: parentB.id,
		licensePlanId: teamSeat.id,
		paidQuantity: UPDATED_PAID_SEATS,
	});
	await expectProductActive({ customer, productId: parentB.id });
});

test(`${chalk.yellowBright("license back-sync: shared license product selects by customized base shape")}`, async () => {
	const customerId = "sub-license-parent-product-shared";
	const pro = products.base({
		id: `${customerId}-pro`,
		items: [items.dashboard()],
	});
	const annualId = `${customerId}-annual`;
	const teamSeat = products.base({
		id: `${customerId}-seat`,
		items: [items.monthlyPrice({ price: 5 })],
		group: `${customerId}-licenses`,
	});
	const scenario = await initScenario({
		customerId,
		ctx: testCtx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, teamSeat] }),
		],
		actions: [],
	});
	const rpc = new AutumnRpcCli({
		secretKey: scenario.ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	await createVariantPlan({
		rpc,
		basePlanId: pro.id,
		variantPlanId: annualId,
		name: "Pro Annual",
	});
	const [proFull, annualFull] = await Promise.all([
		ProductService.getFull({
			db: scenario.ctx.db,
			idOrInternalId: pro.id,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
		}),
		ProductService.getFull({
			db: scenario.ctx.db,
			idOrInternalId: annualId,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
		}),
	]);
	await ProductService.updateByInternalId({
		db: scenario.ctx.db,
		internalId: annualFull.internal_id,
		update: { processor: proFull.processor },
	});

	await customizeLicensePrice({
		scenario,
		parentPlanId: pro.id,
		licensePlanId: teamSeat.id,
		amount: 20,
		interval: BillingInterval.Month,
	});
	await customizeLicensePrice({
		scenario,
		parentPlanId: annualId,
		licensePlanId: teamSeat.id,
		amount: 200,
		interval: BillingInterval.Year,
	});

	const [monthly, annual] = await Promise.all([
		expectCustomizedPriceUnderLicenseProduct({
			ctx: scenario.ctx,
			parentPlanId: pro.id,
			licensePlanId: teamSeat.id,
		}),
		expectCustomizedPriceUnderLicenseProduct({
			ctx: scenario.ctx,
			parentPlanId: annualId,
			licensePlanId: teamSeat.id,
		}),
	]);
	expect(monthly.stripeProductId).toBe(annual.stripeProductId);
	expect(monthly.stripePriceId).not.toBe(annual.stripePriceId);

	const externalAnnualPrice = await createStripeFixedPriceUnderProduct({
		ctx: scenario.ctx,
		stripeProductId: annual.stripeProductId,
		unitAmount: 200 * 100,
		interval: "year",
	});
	await createLicenseSubscription({
		scenario,
		customerId,
		stripePriceId: externalAnnualPrice.id,
	});
	const customer = await waitForLicensePool({
		scenario,
		customerId,
		parentPlanId: annualId,
		licensePlanId: teamSeat.id,
		paidQuantity: INITIAL_PAID_SEATS,
	});
	await expectProductActive({ customer, productId: annualId });
	await expectProductNotPresent({ customer, productId: pro.id });
});

test(`${chalk.yellowBright("license back-sync: parent and child sharing a product still select the parent")}`, async () => {
	const customerId = "sub-license-parent-product-child-shared";
	const parent = products.base({
		id: `${customerId}-parent`,
		items: [items.dashboard()],
	});
	const teamSeat = products.base({
		id: `${customerId}-seat`,
		items: [items.monthlyPrice({ price: 5 })],
		group: `${customerId}-licenses`,
	});
	const scenario = await initScenario({
		customerId,
		ctx: testCtx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [parent, teamSeat] }),
		],
		actions: [],
	});
	const [parentFull, childFull] = await Promise.all([
		ProductService.getFull({
			db: scenario.ctx.db,
			idOrInternalId: parent.id,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
		}),
		ProductService.getFull({
			db: scenario.ctx.db,
			idOrInternalId: teamSeat.id,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
		}),
	]);
	await ProductService.updateByInternalId({
		db: scenario.ctx.db,
		internalId: childFull.internal_id,
		update: { processor: parentFull.processor },
	});

	await customizeLicensePrice({
		scenario,
		parentPlanId: parent.id,
		licensePlanId: teamSeat.id,
		amount: 15,
		interval: BillingInterval.Month,
	});
	const customized = await expectCustomizedPriceUnderLicenseProduct({
		ctx: scenario.ctx,
		parentPlanId: parent.id,
		licensePlanId: teamSeat.id,
	});
	const refreshedChild = await ProductService.getFull({
		db: scenario.ctx.db,
		idOrInternalId: teamSeat.id,
		orgId: scenario.ctx.org.id,
		env: scenario.ctx.env,
	});
	expect(refreshedChild.processor?.id).toBe(parentFull.processor?.id);

	const externalPrice = await createStripeFixedPriceUnderProduct({
		ctx: scenario.ctx,
		stripeProductId: customized.stripeProductId,
		unitAmount: 15 * 100,
	});
	await createLicenseSubscription({
		scenario,
		customerId,
		stripePriceId: externalPrice.id,
	});
	const customer = await waitForLicensePool({
		scenario,
		customerId,
		parentPlanId: parent.id,
		licensePlanId: teamSeat.id,
		paidQuantity: INITIAL_PAID_SEATS,
	});
	await expectProductActive({ customer, productId: parent.id });
});
