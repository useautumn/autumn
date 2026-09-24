/**
 * A main plan's Stripe base item can carry a quantity above 1 ("2 × Pro").
 * Autumn models that as the customer product's quantity: line items and
 * starting balances already multiply by it. The sync never set it, so an
 * imported ×2 plan landed as ×1 and verify flagged it; a later Stripe step
 * from 1 to 2 was refused outright (base_quantity_gt_one).
 *
 * Red (current):  sync_v2 of a ×2 sub gives quantity 1 and verify reports
 *                 "expected 1, Stripe has 2"; a Stripe step 1→2 is skipped.
 * Green (after):  the row carries quantity 2, its included usage doubles, and
 *                 verify is clean; the webhook step re-syncs the row to ×2.
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
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { expectCustomerProductQuantity } from "./utils/expectCustomerProductQuantity";
import {
	fetchFullProduct,
	getBaseStripePriceId,
	getStripeCustomerId,
} from "./utils/syncProductHelpers";

const INCLUDED_MESSAGES = 100;

const proWithMessages = () =>
	products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES })],
	});

test.concurrent(
	`${chalk.yellowBright("sync base quantity: a ×2 main plan imports as quantity 2 and verifies clean")}`,
	async () => {
		const customerId = "sync-base-qty-import";
		const pro = proWithMessages();

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const proPriceId = getBaseStripePriceId({
			fullProduct: await fetchFullProduct({ ctx, productId: pro.id }),
		});
		const subscription = await ctx.stripeCli.subscriptions.create({
			customer: await getStripeCustomerId({ ctx, customerId }),
			items: [{ price: proPriceId, quantity: 2 }],
		});

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: subscription.id,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id, quantity: 2 }] }],
		} satisfies SyncParamsV1);

		await expectCustomerProductQuantity({
			ctx,
			customerId,
			productId: pro.id,
			status: CusProductStatus.Active,
			quantity: 2,
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			granted: INCLUDED_MESSAGES * 2,
		});

		const verified = await verify({ ctx, params: { customer_id: customerId } });
		expect(
			verified.subscriptions.flatMap((subscription) => subscription.mismatches),
		).toEqual([]);
	},
);

test.concurrent(
	`${chalk.yellowBright("sync base quantity: a Stripe step from 1 to 2 re-syncs the row to quantity 2")}`,
	async () => {
		const customerId = "sync-base-qty-step";
		const pro = proWithMessages();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const proPriceId = getBaseStripePriceId({
			fullProduct: await fetchFullProduct({ ctx, productId: pro.id }),
		});
		const subscription = await ctx.stripeCli.subscriptions.create({
			customer: await getStripeCustomerId({ ctx, customerId }),
			items: [{ price: proPriceId, quantity: 1 }],
		});

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: subscription.id,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		} satisfies SyncParamsV1);
		await expectCustomerProductQuantity({
			ctx,
			customerId,
			productId: pro.id,
			status: CusProductStatus.Active,
			quantity: 1,
		});

		const stepped = await ctx.stripeCli.subscriptions.update(subscription.id, {
			items: [{ id: subscription.items.data[0].id, quantity: 2 }],
			proration_behavior: "none",
		});
		expect(stepped.items.data[0].quantity).toBe(2);

		await expectCustomerProductQuantity({
			ctx,
			customerId,
			productId: pro.id,
			status: CusProductStatus.Active,
			quantity: 2,
		});

		const verified = await verify({ ctx, params: { customer_id: customerId } });
		expect(
			verified.subscriptions.flatMap((subscription) => subscription.mismatches),
		).toEqual([]);
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);
