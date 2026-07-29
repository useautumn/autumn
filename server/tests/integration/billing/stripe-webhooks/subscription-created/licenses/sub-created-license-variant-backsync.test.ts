// TDD contract: exact quarterly/annual license variants share one Stripe product.
// Each price selects its matching parent and syncs quantity 3 into the seat pool.
import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	ApiVersion,
	BillingInterval,
} from "@autumn/shared";
import { createExternalStripeSubscription } from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import {
	getBaseStripePriceId,
	getProductStripeProductId,
} from "@tests/integration/billing/sync/utils/syncProductHelpers";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { createVariantPlan } from "@tests/integration/crud/plans/variants/utils/variantTestPlanUtils";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import { ProductService } from "@/internal/products/ProductService";

const PAID_SEATS = 3;

const setupVariantLicenseFamily = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.base({
		id: `${customerId}-pro`,
		items: [items.dashboard()],
	});
	const quarterlySeat = products.base({
		id: `${customerId}-dev-seat`,
		items: [
			constructPriceItem({
				price: 20,
				interval: BillingInterval.Quarter,
			}),
			items.monthlyMessages({ includedUsage: 100 }),
		],
		group: `${customerId}-dev-seat-licenses`,
	});

	const { autumnV1, autumnV2_3 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, quarterlySeat] }),
		],
		actions: [],
	});
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	const annualProId = `${pro.id}-annual`;
	const annualSeatId = `${quarterlySeat.id}-annual`;

	await createVariantPlan({
		rpc,
		basePlanId: pro.id,
		variantPlanId: annualProId,
		name: "Pro Annual",
	});
	await createVariantPlan({
		rpc,
		basePlanId: quarterlySeat.id,
		variantPlanId: annualSeatId,
		name: "Pro Annual Dev Seat",
	});
	await rpc.post("/plans.update", {
		plan_id: annualSeatId,
		price: { amount: 200, interval: BillingInterval.Year },
		disable_version: true,
	});
	await rpc.post("/plans.update", {
		plan_id: pro.id,
		licenses: [{ license_plan_id: quarterlySeat.id, included: 0 }],
	});
	await rpc.post("/plans.update", {
		plan_id: annualProId,
		licenses: [{ license_plan_id: annualSeatId, included: 0 }],
	});

	const quarterlySeatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: quarterlySeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const annualSeatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: annualSeatId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const quarterlyStripeProductId = getProductStripeProductId({
		fullProduct: quarterlySeatFull,
	});
	expect(
		getProductStripeProductId({ fullProduct: annualSeatFull }),
	).toBe(quarterlyStripeProductId);
	const quarterlyStripePriceId = getBaseStripePriceId({
		fullProduct: quarterlySeatFull,
	});
	const annualStripePriceId = getBaseStripePriceId({
		fullProduct: annualSeatFull,
	});
	expect(annualStripePriceId).not.toBe(quarterlyStripePriceId);

	return {
		autumnV1,
		autumnV2_3,
		proId: pro.id,
		annualProId,
		quarterlySeatId: quarterlySeat.id,
		annualSeatId,
		quarterlyStripePriceId,
		annualStripePriceId,
	};
};

test(`${chalk.yellowBright("sub.created license variant back-sync: quarterly seat quantity 3 selects quarterly Pro")}`, async () => {
	const customerId = "sub-created-license-backsync-quarterly-variant";
	const family = await setupVariantLicenseFamily({ customerId });

	const stripeSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: family.quarterlyStripePriceId, quantity: PAID_SEATS }],
	});
	expect(stripeSubscription.status).toBe("active");
	await timeout(12_000);

	const customerV3 = await family.autumnV1.customers.get<ApiCustomerV3>(
		customerId,
	);
	await expectProductActive({ customer: customerV3, productId: family.proId });
	await expectProductNotPresent({
		customer: customerV3,
		productId: family.annualProId,
	});

	const customer = await family.autumnV2_3.customers.get<ApiCustomerV5>(
		customerId,
	);
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: family.quarterlySeatId,
				parent_plan_id: family.proId,
				paid_quantity: PAID_SEATS,
				granted: PAID_SEATS,
				usage: 0,
				remaining: PAID_SEATS,
			},
		],
	});
	await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: family.proId,
		subscriptionId: stripeSubscription.id,
		isCustom: false,
		basePrice: { amount: 20, interval: BillingInterval.Quarter },
	});
});

test(`${chalk.yellowBright("sub.created license variant back-sync: annual seat quantity 3 selects Pro Annual")}`, async () => {
	const customerId = "sub-created-license-backsync-annual-variant";
	const family = await setupVariantLicenseFamily({ customerId });

	const stripeSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: family.annualStripePriceId, quantity: PAID_SEATS }],
	});
	expect(stripeSubscription.status).toBe("active");
	await timeout(12_000);

	const customerV3 = await family.autumnV1.customers.get<ApiCustomerV3>(
		customerId,
	);
	await expectProductActive({
		customer: customerV3,
		productId: family.annualProId,
	});
	await expectProductNotPresent({
		customer: customerV3,
		productId: family.proId,
	});

	const customer = await family.autumnV2_3.customers.get<ApiCustomerV5>(
		customerId,
	);
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: family.annualSeatId,
				parent_plan_id: family.annualProId,
				paid_quantity: PAID_SEATS,
				granted: PAID_SEATS,
				usage: 0,
				remaining: PAID_SEATS,
			},
		],
	});
	await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: family.annualProId,
		subscriptionId: stripeSubscription.id,
		isCustom: false,
		basePrice: { amount: 200, interval: BillingInterval.Year },
	});
});
