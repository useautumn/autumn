// Contract: a parent link customizes its child from $10 to $20/mo and 100 to 200 messages/mo.
// Attaching 2 bills $40; an assigned entity gets 200 while the shared child stays unchanged.
import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	ApiEntityV2,
	ApiPlanV1,
	AttachParamsV1Input,
} from "@autumn/shared";
import { BillingInterval } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BASE_SEAT_PRICE = 10;
const CUSTOM_SEAT_PRICE = 20;
const BASE_MESSAGES = 100;
const CUSTOM_MESSAGES = 200;
const SEAT_QUANTITY = 2;

test(`${chalk.yellowBright("license attach: persisted parent customization controls child price and items")}`, async () => {
	const customerId = "attach-parent-customized-license";
	const pro = products.base({
		id: "attach-customized-child-pro",
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: "attach-customized-child-dev-seat",
		group: "attach-customized-child-licenses",
		items: [
			items.monthlyPrice({ price: BASE_SEAT_PRICE }),
			items.monthlyMessages({ includedUsage: BASE_MESSAGES }),
		],
	});
	const { autumnV1, autumnV2_2, autumnV2_3, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro, devSeat] }),
		],
		actions: [],
	});

	await autumnV2_2.post("/plans.update", {
		plan_id: pro.id,
		licenses: [
			{
				license_plan_id: devSeat.id,
				included: 0,
				customize: {
					price: {
						amount: CUSTOM_SEAT_PRICE,
						interval: BillingInterval.Month,
					},
					remove_items: [{ feature_id: TestFeature.Messages }],
					add_items: [itemsV2.monthlyMessages({ included: CUSTOM_MESSAGES })],
				},
			},
		],
	});

	const [parentPlan, baseChildPlan] = (await Promise.all([
		autumnV2_2.post("/plans.get", { plan_id: pro.id }),
		autumnV2_2.post("/plans.get", { plan_id: devSeat.id }),
	])) as [ApiPlanV1, ApiPlanV1];
	expect(parentPlan.licenses?.[0]?.customize).toMatchObject({
		price: {
			amount: CUSTOM_SEAT_PRICE,
			interval: BillingInterval.Month,
		},
		add_items: [
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				included: CUSTOM_MESSAGES,
			}),
		],
		remove_items: [
			expect.objectContaining({ feature_id: TestFeature.Messages }),
		],
	});
	expect(baseChildPlan.price).toMatchObject({
		amount: BASE_SEAT_PRICE,
		interval: BillingInterval.Month,
	});
	expect(baseChildPlan.items).toContainEqual(
		expect.objectContaining({
			feature_id: TestFeature.Messages,
			included: BASE_MESSAGES,
		}),
	);

	const attachParams: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: pro.id,
		redirect_mode: "if_required",
		license_quantities: [
			{ license_plan_id: devSeat.id, quantity: SEAT_QUANTITY },
		],
	};
	const preview =
		await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(attachParams);
	expect(preview.total).toBe(SEAT_QUANTITY * CUSTOM_SEAT_PRICE);

	await autumnV2_3.billing.attach<AttachParamsV1Input>(attachParams);

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: devSeat.id,
				parent_plan_id: pro.id,
				paid_quantity: SEAT_QUANTITY,
				granted: SEAT_QUANTITY,
				usage: 0,
				remaining: SEAT_QUANTITY,
			},
		],
	});
	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3,
		count: 1,
		latestTotal: SEAT_QUANTITY * CUSTOM_SEAT_PRICE,
	});
	await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: pro.id,
		isCustom: false,
		basePrice: {
			amount: CUSTOM_SEAT_PRICE,
			interval: BillingInterval.Month,
		},
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: devSeat.id,
		entities: [
			{
				entity_id: "attach-customized-child-entity",
				name: "Customized child seat",
				feature_id: TestFeature.Users,
			},
		],
	});
	const entity = await autumnV2_3.entities.get<ApiEntityV2>(
		customerId,
		"attach-customized-child-entity",
	);
	expectBalanceCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		planId: devSeat.id,
		granted: CUSTOM_MESSAGES,
		remaining: CUSTOM_MESSAGES,
		usage: 0,
	});
});
