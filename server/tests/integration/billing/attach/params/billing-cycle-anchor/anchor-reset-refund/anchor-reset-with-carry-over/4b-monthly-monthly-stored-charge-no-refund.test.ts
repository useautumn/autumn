import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
	AttachPreviewResponse,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("anchor-reset-carry-over 4b: monthly -> monthly stored charge (no refund)")}`,
	async () => {
		const customerId = "anchor-carry-m2m-stored";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ toNextInvoice: true }),
				s.advanceTestClock({ days: 14 }),
				s.track({ featureId: TestFeature.Messages, value: 30, timeout: 2000 }),
			],
		});

		const preview =
			(await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: premium.id,
				billing_cycle_anchor: "now",
				proration_behavior: "none",
				carry_over_balances: { enabled: true },
				plan_schedule: "immediate",
			})) as AttachPreviewResponse;
		expect(preview.total).toBe(50);
		expect(preview.line_items.every((item) => item.total >= 0)).toBe(true);

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			billing_cycle_anchor: "now",
			proration_behavior: "none",
			carry_over_balances: { enabled: true },
			redirect_mode: "if_required",
			plan_schedule: "immediate",
		});

		expect(result.invoice).toBeDefined();
		expect(result.invoice?.total).toBe(50);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
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
	300_000,
);
