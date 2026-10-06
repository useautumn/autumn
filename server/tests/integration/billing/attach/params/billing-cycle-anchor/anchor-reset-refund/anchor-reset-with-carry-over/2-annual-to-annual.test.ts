import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * billing_cycle_anchor "now" + proration_behavior "none" with carry_over_balances, like Stripe: the new plan's
 * items are charged a full new period and the outgoing plan is credited nothing. Carried balances still move.
 */

test.concurrent(
	`${chalk.yellowBright("anchor-reset-carry-over 2: annual -> annual charges the new plan in full, credits nothing and carries the balance")}`,
	async () => {
		const customerId = "anchor-no-partial-a2a";
		const proAnnual = products.proAnnual({
			id: "pro-annual",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premiumAnnual = products.base({
			id: "premium-annual",
			items: [
				items.monthlyMessages({ includedUsage: 500 }),
				items.annualPrice({ price: 500 }),
			],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proAnnual, premiumAnnual] }),
			],
			actions: [
				s.billing.attach({ productId: proAnnual.id }),
				s.advanceTestClock({ months: 2, days: 15 }),
				s.track({ featureId: TestFeature.Messages, value: 30, timeout: 2000 }),
			],
		});

		const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				plan_id: premiumAnnual.id,
				billing_cycle_anchor: "now",
				proration_behavior: "none",
				carry_over_balances: { enabled: true },
			},
		);

		expect(preview.total).toBe(500);

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premiumAnnual.id,
			billing_cycle_anchor: "now",
			proration_behavior: "none",
			carry_over_balances: { enabled: true },
			redirect_mode: "if_required",
		});

		expect(result.invoice).toBeDefined();
		expect(result.invoice?.total).toBe(500);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			active: [premiumAnnual.id],
			notPresent: [proAnnual.id],
		});

		// The 70 messages left on the old plan carry onto the new plan's 500.
		expectCustomerFeatureCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			featureId: TestFeature.Messages,
			balance: 570,
			usage: 0,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
