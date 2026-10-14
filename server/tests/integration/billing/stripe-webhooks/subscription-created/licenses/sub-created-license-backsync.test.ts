import { expect, test } from "bun:test";
import { type ApiCustomerV5, BillingInterval } from "@autumn/shared";
import { createExternalStripeSubscription } from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import {
	createStripeFixedPriceUnderProduct,
	getBaseStripePriceId,
} from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

const INCLUDED_SEATS = 1;
const PAID_SEATS = 3;

test(`${chalk.yellowBright("sub.created license back-sync: 3x license price attaches parent with paid pool")}`, async () => {
	const customerId = "sub-created-license-backsync";

	const parent = products.base({
		id: "lic-backsync-parent",
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: "lic-backsync-seat",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
		group: "lic-backsync-licenses",
	});

	const { autumnV2_3 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [parent, devSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: devSeat.id,
				included: INCLUDED_SEATS,
			}),
		],
	});

	const seatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: devSeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const stripeSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [
			{
				price: getBaseStripePriceId({ fullProduct: seatFull }),
				quantity: PAID_SEATS,
			},
		],
	});
	expect(stripeSubscription.status).toBe("active");

	await expectProductActive({
		customerId,
		autumn: autumnV2_3,
		productId: parent.id,
		settleTimeoutMs: 30_000,
	});

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: devSeat.id,
				parent_plan_id: parent.id,
				paid_quantity: PAID_SEATS,
				granted: INCLUDED_SEATS + PAID_SEATS,
				usage: 0,
				remaining: INCLUDED_SEATS + PAID_SEATS,
			},
		],
	});

	await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		subscriptionId: stripeSubscription.id,
		isCustom: false,
		basePrice: { amount: 20, interval: BillingInterval.Month },
	});
});

const CUSTOM_SEAT_PRICE = 120;
const CUSTOM_PAID_SEATS = 2;

test(`${chalk.yellowBright("sub.created license back-sync: custom $120/yr license price attaches parent with customized license")}`, async () => {
	const customerId = "sub-created-license-backsync-custom";

	const parent = products.base({
		id: "lic-backsync-cstm-parent",
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: "lic-backsync-cstm-seat",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
		group: "lic-backsync-cstm-licenses",
	});

	const { autumnV2_3 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [parent, devSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: devSeat.id,
				included: INCLUDED_SEATS,
			}),
		],
	});

	const seatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: devSeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const seatStripeProductId = seatFull.processor?.id;
	if (!seatStripeProductId) {
		throw new Error("Seat product has no Stripe product id");
	}

	const customStripePrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: seatStripeProductId,
		unitAmount: CUSTOM_SEAT_PRICE * 100,
		interval: "year",
	});

	const stripeSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: customStripePrice.id, quantity: CUSTOM_PAID_SEATS }],
	});
	expect(stripeSubscription.status).toBe("active");

	await expectProductActive({
		customerId,
		autumn: autumnV2_3,
		productId: parent.id,
		settleTimeoutMs: 30_000,
	});

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: devSeat.id,
				parent_plan_id: parent.id,
				paid_quantity: CUSTOM_PAID_SEATS,
				granted: INCLUDED_SEATS + CUSTOM_PAID_SEATS,
				usage: 0,
				remaining: INCLUDED_SEATS + CUSTOM_PAID_SEATS,
			},
		],
	});

	await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		subscriptionId: stripeSubscription.id,
		isCustom: true,
		basePrice: {
			amount: CUSTOM_SEAT_PRICE,
			interval: BillingInterval.Year,
			stripePriceId: customStripePrice.id,
		},
	});
});
