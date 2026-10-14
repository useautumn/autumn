import { expect, test } from "bun:test";
import type {
	AttachPreviewResponse,
	CreateScheduleParamsV0Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import {
	expectNoCustomStripePrices,
	expectNoStripeResources,
} from "@tests/integration/billing/misc/utils/expectNoStripeResources";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

const buildItems = () => [
	items.monthlyMessages({ includedUsage: 100 }),
	items.prepaidUsers({ billingUnits: 1 }),
	items.consumableWords({ includedUsage: 0 }),
	items.allocatedWorkflows({ includedUsage: 0 }),
];

test.concurrent(`${chalk.yellowBright(
	"previewAttach on no-stripe plan: preview totals correct, no Stripe IDs created",
)}`, async () => {
	const customerId = "preview-no-stripe-attach";

	const proPlan = products.pro({
		id: "pro-no-stripe-attach",
		items: buildItems(),
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proPlan], createInStripe: false }),
		],
		actions: [],
	});

	const preview = (await autumnV2_2.billing.previewAttach({
		customer_id: customerId,
		plan_id: proPlan.id,
	})) as AttachPreviewResponse;

	expect(preview.subtotal).toBe(20);
	expect(preview.total).toBe(20);
	expect(preview.currency.toLowerCase()).toBe("usd");

	await expectNoStripeResources({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		productId: proPlan.id,
	});
});

test.concurrent(`${chalk.yellowBright(
	"preview_create_schedule multi-phase on no-stripe plans: preview works, no Stripe IDs created",
)}`, async () => {
	const customerId = "preview-no-stripe-schedule";

	const proPlan = products.pro({
		id: "pro-no-stripe-schedule",
		items: buildItems(),
	});
	const premiumPlan = products.premium({
		id: "premium-no-stripe-schedule",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, advancedTo, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proPlan, premiumPlan], createInStripe: false }),
		],
		actions: [],
	});

	const params: CreateScheduleParamsV0Input = {
		customer_id: customerId,
		phases: [
			{
				starts_at: advancedTo,
				plans: [
					{
						plan_id: proPlan.id,
						customize: {
							price: itemsV2.monthlyPrice({ amount: 35 }),
						},
					},
				],
			},
			{
				starts_at: advancedTo + 30 * 24 * 60 * 60 * 1000,
				plans: [{ plan_id: premiumPlan.id }],
			},
		],
	};

	const preview = (await autumnV1.post(
		"/billing.preview_create_schedule",
		params,
	)) as AttachPreviewResponse;

	expect(preview.total).toBe(35);
	expect(preview.subtotal).toBe(35);

	await expectNoStripeResources({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		productId: proPlan.id,
	});
	await expectNoStripeResources({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		productId: premiumPlan.id,
	});
});

test.concurrent(`${chalk.yellowBright(
	"previewUpdate customize on active sub: no is_custom prices with Stripe IDs created",
)}`, async () => {
	const customerId = "preview-no-stripe-update";

	const stripeBackedPlan = products.pro({
		id: "pro-with-stripe-update",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [stripeBackedPlan] }),
		],
		actions: [s.billing.attach({ productId: stripeBackedPlan.id })],
	});

	const fullBefore = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: stripeBackedPlan.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: stripeBackedPlan.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 30 }),
		},
	};

	const preview = await autumnV2_2.subscriptions.previewUpdate(params);
	expect(typeof preview.total).toBe("number");

	await expectNoCustomStripePrices({
		db: ctx.db,
		internalProductId: fullBefore.internal_id,
	});
});
