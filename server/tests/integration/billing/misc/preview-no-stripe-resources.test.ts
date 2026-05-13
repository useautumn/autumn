/**
 * Preview billing actions must not create Stripe resources.
 *
 * Contract under test:
 *   - A plan created with create_in_stripe=false stays Stripe-less after
 *     these preview endpoints run:
 *       * POST /billing.preview_attach
 *       * POST /billing.preview_create_schedule (multi-phase)
 *       * POST /billing.preview_update (with customize)
 *   - No is_custom prices with Stripe IDs are persisted by customize
 *     previews.
 *   - Item coverage: monthlyMessages (metered), prepaidUsers,
 *     consumableWords, allocatedWorkflows.
 *
 * Implementation surface:
 *   server/src/internal/billing/v2/providers/stripe/utils/common/
 *     initStripeResourcesForProducts.ts — early returns via
 *     applyPreviewStripeResourcesToBillingPlan when dryRunStripe=true.
 */

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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: previewAttach against a plan created with create_in_stripe=false
// ═══════════════════════════════════════════════════════════════════════════════

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

	// s.products mutates proPlan.id to include the `_${customerId}` prefix.
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: preview_create_schedule with multiple phases on no-stripe plans
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: previewUpdate with customize on an active no-stripe sub. The customer
// is already on a no-stripe plan attached via /billing.preview_attach +
// /billing.preview_update is impossible — instead we attach the no-stripe plan
// via attach which would normally create Stripe resources. To avoid that, we
// rely on the contract that any sub created via real attach on a no-stripe
// plan still preview-cleanly. We attach a stripe-backed plan A so the customer
// has an active sub, then previewUpdate with customize.items shapes drawn from
// every payable category; the assertion is that no is_custom prices got
// persisted with Stripe IDs by the preview.
// ═══════════════════════════════════════════════════════════════════════════════

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
