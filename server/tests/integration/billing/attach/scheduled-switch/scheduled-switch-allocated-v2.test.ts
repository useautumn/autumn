import { expect, test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-allocated v2: downgrade carries usage to new plan")}`,
	async () => {
		const customerId = "sched-switch-allocated-v2-carryover";

		const premium = products.premium({
			id: "premium",
			items: [items.allocatedV2Users({ includedUsage: 5 })],
		});
		const pro = products.pro({
			id: "pro",
			items: [items.allocatedV2Users({ includedUsage: 2 })],
		});

		const { autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [s.billing.attach({ productId: premium.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 4,
		});
		await timeout(2000);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 50,
		});

		const preview = await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				plan_id: pro.id,
			},
		);
		expect(preview.total).toBe(0);

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 50,
		});

		const customerScheduled =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer: customerScheduled,
			canceling: [premium.id],
			scheduled: [pro.id],
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		const customerAfterCycle =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer: customerAfterCycle,
			active: [pro.id],
			notPresent: [premium.id],
		});
		expectBalanceCorrect({
			customer: customerAfterCycle,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 4,
			planId: pro.id,
			nextResetAt: null,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 20,
			latestInvoiceProductId: pro.id,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
