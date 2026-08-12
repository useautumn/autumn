// Red: external schedules require Stripe. Green: explicit and inferred
// database-only create/preview flows work while connected schedules use Stripe.

import { expect, test } from "bun:test";
import { type CreateScheduleParamsV0, customerProducts } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { billingActions } from "@/internal/billing/v2/actions";
import { getCustomerProductEntitlementBalances } from "../utils/createScheduleTestHelpers";

const withoutStripe = (ctx: TestContext): TestContext => ({
	...ctx,
	org: {
		...ctx.org,
		stripe_connected: false,
		stripe_config: null,
		test_stripe_connect: {},
	},
});

const setupExternalSchedule = async ({
	suffix,
	noBillingChanges,
	historicalPhase,
}: {
	suffix: string;
	noBillingChanges?: boolean;
	historicalPhase?: boolean;
}) => {
	const customerId = `create-schedule-no-stripe-${suffix}`;
	const pro = products[historicalPhase ? "pro" : "base"]({
		id: `pro-no-stripe-schedule-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
		actions: [],
	});
	const noStripeCtx = withoutStripe(ctx);

	await billingActions.attach({
		ctx: noStripeCtx,
		params: {
			customer_id: customerId,
			plan_id: pro.id,
			no_billing_changes: true,
			redirect_mode: "never",
		},
	});

	const now = Date.now();
	const currentPhase = {
		starts_at: now,
		plans: [{ plan_id: pro.id }],
	};
	const futurePhase = {
		starts_at: now + 31 * 24 * 60 * 60 * 1000,
		plans: [
			{
				plan_id: pro.id,
				customize: {
					items: [itemsV2.monthlyMessages({ included: 200 })],
				},
			},
		],
	};
	const phases: CreateScheduleParamsV0["phases"] = historicalPhase
		? [
				{
					starts_at: now - 31 * 24 * 60 * 60 * 1000,
					plans: [{ plan_id: pro.id }],
				},
				currentPhase,
				futurePhase,
			]
		: [currentPhase, futurePhase];
	const params: CreateScheduleParamsV0 = {
		customer_id: customerId,
		...(noBillingChanges && { no_billing_changes: true }),
		billing_behavior: "none",
		redirect_mode: "never",
		phases,
	};

	return { ctx, noStripeCtx, params };
};

const expectScheduleCreated = async ({
	ctx,
	response,
}: {
	ctx: TestContext;
	response: Awaited<ReturnType<typeof billingActions.createSchedule>>;
}) => {
	expect(response.status).toBe("created");
	expect(response.phases).toHaveLength(2);
	const futureCustomerProductId = response.phases[1]!.customer_product_ids[0]!;
	expect(
		await getCustomerProductEntitlementBalances({
			ctx,
			customerProductId: futureCustomerProductId,
		}),
	).toEqual([{ feature_id: TestFeature.Messages, balance: 200 }]);
};

test.concurrent(
	`${chalk.yellowBright("create-schedule external billing: explicit no_billing_changes works without Stripe")}`,
	async () => {
		const { ctx, noStripeCtx, params } = await setupExternalSchedule({
			suffix: "explicit",
			noBillingChanges: true,
		});
		const response = await billingActions.createSchedule({
			ctx: noStripeCtx,
			params,
		});

		await expectScheduleCreated({ ctx, response });
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule external billing: exact no-Stripe payload creates a schedule")}`,
	async () => {
		const { ctx, noStripeCtx, params } = await setupExternalSchedule({
			suffix: "inferred",
		});
		const response = await billingActions.createSchedule({
			ctx: noStripeCtx,
			params,
		});

		await expectScheduleCreated({ ctx, response });
	},
);

test.concurrent(
	`${chalk.yellowBright("preview-create-schedule external billing: exact no-Stripe payload previews")}`,
	async () => {
		const { noStripeCtx, params } = await setupExternalSchedule({
			suffix: "preview",
			historicalPhase: true,
		});
		const preview = await billingActions.previewCreateSchedule({
			ctx: noStripeCtx,
			params,
		});

		expect(preview.total).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule billing_behavior none: connected organizations still update Stripe")}`,
	async () => {
		const customerId = "create-schedule-none-connected-stripe";
		const pro = products.pro({
			id: "create-schedule-none-connected-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "create-schedule-none-connected-premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});
		const now = Date.now();

		const response = await billingActions.createSchedule({
			ctx,
			params: {
				customer_id: customerId,
				billing_behavior: "none",
				redirect_mode: "never",
				phases: [
					{ starts_at: now, plans: [{ plan_id: pro.id }] },
					{
						starts_at: now + 31 * 24 * 60 * 60 * 1000,
						plans: [{ plan_id: premium.id }],
					},
				],
			},
		});
		const [activeCustomerProduct] = await ctx.db
			.select()
			.from(customerProducts)
			.where(
				eq(customerProducts.id, response.phases[0]!.customer_product_ids[0]!),
			);
		const stripeSubscriptionId = activeCustomerProduct?.subscription_ids?.[0];

		expect(stripeSubscriptionId).toBeDefined();
		const stripeSubscription = await ctx.stripeCli.subscriptions.retrieve(
			stripeSubscriptionId!,
		);
		expect(stripeSubscription.schedule).toBeTruthy();
	},
);
