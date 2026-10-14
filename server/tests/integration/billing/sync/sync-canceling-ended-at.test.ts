import { expect, test } from "bun:test";
import type { SyncProposalsV2Response } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { createStripeSubscriptionFromProduct } from "./utils/syncTestUtils";

test.concurrent(
	`${chalk.yellowBright("sync-canceling: syncV2 sets canceled_at / ended_at / starts_at")}`,
	async () => {
		const customerId = "sync-canceling-ended-at";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const stripeSubscription = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		const cancelingSub = await ctx.stripeCli.subscriptions.update(
			stripeSubscription.id,
			{ cancel_at_period_end: true },
		);
		expect(cancelingSub.cancel_at_period_end).toBe(true);

		const proposalsResponse: SyncProposalsV2Response = await autumnV1.post(
			"/billing.sync_proposals_v2",
			{ customer_id: customerId },
		);
		const proposal = proposalsResponse.proposals.find(
			(candidate) => candidate.stripe_subscription_id === stripeSubscription.id,
		);
		expect(proposal).toBeDefined();

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: stripeSubscription.id,
			phases: proposal!.phases,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const cusProduct = fullCustomer.customer_products.find(
			(customerProduct) =>
				customerProduct.product_id === pro.id &&
				customerProduct.subscription_ids?.includes(stripeSubscription.id),
		);
		expect(cusProduct).toBeDefined();

		expect(cusProduct!.canceled).toBe(true);
		expect(cusProduct!.canceled_at).not.toBeNull();
		expect(cusProduct!.ended_at).not.toBeNull();
		expect(cusProduct!.ended_at).toBe(cancelingSub.cancel_at! * 1000);
		expect(cusProduct!.starts_at).toBe(cancelingSub.start_date * 1000);

		await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
	},
);
