import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-basic 5a: premium to pro with reset_usage_when_enabled: false (mid-cycle)")}`,
	async () => {
		const customerId = "sched-switch-reset-usage-false-premium-to-pro-a";

		const premiumMessagesItem = items.monthlyMessages({
			includedUsage: 1000,
			resetUsageWhenEnabled: false,
		});
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const proMessagesItem = items.monthlyMessages({
			includedUsage: 500,
			resetUsageWhenEnabled: false,
		});
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.track({ featureId: TestFeature.Messages, value: 300, timeout: 4000 }),
			],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 700,
			usage: 300,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		const customerMidCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerMidCycle,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: customerMidCycle,
			productId: pro.id,
		});

		expectCustomerFeatureCorrect({
			customer: customerMidCycle,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 700,
			usage: 300,
		});
	},
);
