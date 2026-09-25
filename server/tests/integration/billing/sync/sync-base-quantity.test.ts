/**
 * A main plan's Stripe base item can carry a quantity above 1 ("2 × Pro").
 * Autumn models that the way it already models add-on quantity and manual
 * imports: one customer product per instance, each at quantity 1. The sync
 * refused it (base_quantity_gt_one), so imports landed ×1 and Stripe steps
 * were skipped.
 *
 * Red (before):  import ×2 gives one row; a Stripe step 1→2 is skipped.
 * Green (after):  import ×2 gives two rows; Stripe steps add or expire rows;
 *                 a plan switch replaces the rows; verify is clean throughout.
 */

import { expect, test } from "bun:test";
import { CusProductStatus, type SyncParamsV1 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_TEST_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { expectPlanRowCounts } from "./utils/expectPlanRowCounts";
import {
	fetchFullProduct,
	getBaseStripePriceId,
	getStripeCustomerId,
} from "./utils/syncProductHelpers";

const PRO_INCLUDED = 100;
const PREMIUM_INCLUDED = 500;
const TRACKED = 50;

const pro = () =>
	products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: PRO_INCLUDED })],
	});
const premium = () =>
	products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: PREMIUM_INCLUDED })],
	});

const setupSyncedSubscription = async ({
	customerId,
	proQuantity,
}: {
	customerId: string;
	proQuantity: number;
}) => {
	const proPlan = pro();
	const premiumPlan = premium();
	const { autumnV1, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proPlan, premiumPlan] }),
		],
		actions: [],
	});
	const [proFull, premiumFull] = await Promise.all([
		fetchFullProduct({ ctx, productId: proPlan.id }),
		fetchFullProduct({ ctx, productId: premiumPlan.id }),
	]);
	const proPriceId = getBaseStripePriceId({ fullProduct: proFull });
	const premiumPriceId = getBaseStripePriceId({ fullProduct: premiumFull });

	const subscription = await ctx.stripeCli.subscriptions.create({
		customer: await getStripeCustomerId({ ctx, customerId }),
		items: [{ price: proPriceId, quantity: proQuantity }],
	});
	await autumnV1.post("/billing.sync_v2", {
		customer_id: customerId,
		stripe_subscription_id: subscription.id,
		phases: [
			{
				starts_at: "now",
				plans: [
					{ plan_id: proPlan.id, quantity: proQuantity, expire_previous: true },
				],
			},
		],
	} satisfies SyncParamsV1);
	await expectPlanRowCounts({
		ctx,
		customerId,
		productId: proPlan.id,
		expected: { [CusProductStatus.Active]: proQuantity },
	});

	return {
		autumnV1,
		autumnV2_3,
		proPlan,
		premiumPlan,
		premiumPriceId,
		subscription,
	};
};

const setStripeItem = async ({
	subscription,
	price,
	quantity,
}: {
	subscription: Stripe.Subscription;
	price?: string;
	quantity: number;
}) => {
	const updated = await ctx.stripeCli.subscriptions.update(subscription.id, {
		items: [
			{
				id: subscription.items.data[0].id,
				...(price ? { price } : {}),
				quantity,
			},
		],
		proration_behavior: "none",
	});
	expect(updated.items.data[0].quantity).toBe(quantity);
};

const expectVerifyClean = async ({ customerId }: { customerId: string }) => {
	const verified = await verify({ ctx, params: { customer_id: customerId } });
	expect(
		verified.subscriptions.flatMap((subscription) => subscription.mismatches),
	).toEqual([]);
};

test.concurrent(
	`${chalk.yellowBright("sync base quantity: a ×2 main plan imports as two rows and verifies clean")}`,
	async () => {
		const customerId = "sync-base-qty-import";
		const { autumnV2_3 } = await setupSyncedSubscription({
			customerId,
			proQuantity: 2,
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			granted: PRO_INCLUDED * 2,
		});
		await expectVerifyClean({ customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("sync base quantity: a Stripe step from 1 to 2 adds a second row")}`,
	async () => {
		const customerId = "sync-base-qty-step-up";
		const { proPlan, subscription } = await setupSyncedSubscription({
			customerId,
			proQuantity: 1,
		});

		await setStripeItem({ subscription, quantity: 2 });

		await expectPlanRowCounts({
			ctx,
			customerId,
			productId: proPlan.id,
			expected: { [CusProductStatus.Active]: 2, [CusProductStatus.Expired]: 0 },
		});
		await expectVerifyClean({ customerId });
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);

test.concurrent(
	`${chalk.yellowBright("sync base quantity: a Stripe step from 2 to 1 expires one row")}`,
	async () => {
		const customerId = "sync-base-qty-step-down";
		const { proPlan, subscription } = await setupSyncedSubscription({
			customerId,
			proQuantity: 2,
		});

		await setStripeItem({ subscription, quantity: 1 });

		await expectPlanRowCounts({
			ctx,
			customerId,
			productId: proPlan.id,
			expected: { [CusProductStatus.Active]: 1, [CusProductStatus.Expired]: 1 },
		});
		await expectVerifyClean({ customerId });
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);

test.concurrent(
	`${chalk.yellowBright("sync base quantity: ×2 Pro switched to ×1 Premium replaces both rows and carries usage")}`,
	async () => {
		const customerId = "sync-base-qty-switch-down";
		const {
			autumnV1,
			autumnV2_3,
			proPlan,
			premiumPlan,
			premiumPriceId,
			subscription,
		} = await setupSyncedSubscription({ customerId, proQuantity: 2 });

		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: TRACKED,
			},
			{ timeout: 3000 },
		);
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			granted: PRO_INCLUDED * 2,
			usage: TRACKED,
		});

		await setStripeItem({ subscription, price: premiumPriceId, quantity: 1 });

		await expectPlanRowCounts({
			ctx,
			customerId,
			productId: premiumPlan.id,
			expected: { [CusProductStatus.Active]: 1 },
		});
		await expectPlanRowCounts({
			ctx,
			customerId,
			productId: proPlan.id,
			expected: { [CusProductStatus.Active]: 0, [CusProductStatus.Expired]: 2 },
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			granted: PREMIUM_INCLUDED,
			usage: TRACKED,
		});
		await expectVerifyClean({ customerId });
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);

test.concurrent(
	`${chalk.yellowBright("sync base quantity: ×1 Pro switched to ×2 Premium gives two Premium rows")}`,
	async () => {
		const customerId = "sync-base-qty-switch-up";
		const { proPlan, premiumPlan, premiumPriceId, subscription } =
			await setupSyncedSubscription({ customerId, proQuantity: 1 });

		await setStripeItem({ subscription, price: premiumPriceId, quantity: 2 });

		await expectPlanRowCounts({
			ctx,
			customerId,
			productId: premiumPlan.id,
			expected: { [CusProductStatus.Active]: 2 },
		});
		await expectPlanRowCounts({
			ctx,
			customerId,
			productId: proPlan.id,
			expected: { [CusProductStatus.Active]: 0, [CusProductStatus.Expired]: 1 },
		});
		await expectVerifyClean({ customerId });
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);

test.concurrent(
	`${chalk.yellowBright("sync base quantity: a direct re-sync at a lower quantity expires the surplus rows")}`,
	async () => {
		const customerId = "sync-base-qty-resync-down";
		const { autumnV1, proPlan, subscription } = await setupSyncedSubscription({
			customerId,
			proQuantity: 3,
		});

		await setStripeItem({ subscription, quantity: 2 });
		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: subscription.id,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: proPlan.id, quantity: 2, expire_previous: true }],
				},
			],
		} satisfies SyncParamsV1);

		await expectPlanRowCounts({
			ctx,
			customerId,
			productId: proPlan.id,
			expected: { [CusProductStatus.Active]: 2 },
		});
		await expectVerifyClean({ customerId });
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);
