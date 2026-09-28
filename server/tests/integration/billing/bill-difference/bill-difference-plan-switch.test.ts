/**
 * proration_behavior: "bill_difference" on a mid-cycle plan switch.
 *
 * Contract:
 *   Pro ($20) -> Premium ($50) on day 14 charges the full-period difference ($30) now,
 *   grants Premium's full balance, and keeps the renewal date, which bills $50 again.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	AttachParamsV1Input,
	BillingPreviewResponse,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { getBillingPeriod } from "@tests/integration/billing/utils/proration/getBillingPeriod";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("bill_difference: pro -> premium charges the full price difference")}`,
	async () => {
		const customerId = "bill-diff-plan-switch";

		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_4, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 14 }),
			],
		});

		const { billingPeriod } = await getBillingPeriod({ customerId });

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
			proration_behavior: "bill_difference",
		};

		const preview: BillingPreviewResponse =
			await autumnV2_4.billing.previewAttach<AttachParamsV1Input>(params);
		expect(preview.total).toEqual(30);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: billingPeriod.end,
			total: 50,
		});

		await autumnV2_4.billing.attach<AttachParamsV1Input>(params);

		const customer = await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
		await expectProductActive({ customer, productId: premium.id });
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: TestFeature.Messages,
			remaining: 500,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 30,
		});

		const { billingPeriod: periodAfter } = await getBillingPeriod({
			customerId,
		});
		expect(periodAfter.end).toEqual(billingPeriod.end);
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
