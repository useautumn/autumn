import { test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("track-paid allocated v2: concurrent tracks do not invoice mid-cycle")}`,
	async () => {
		const customerId = "track-paid-allocated-v2-concurrent";
		const pro = products.pro({
			id: "pro",
			items: [items.allocatedV2Users({ includedUsage: 2 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});

		await Promise.all(
			Array.from({ length: 10 }, () =>
				autumnV2_3.track({
					customer_id: customerId,
					feature_id: TestFeature.Users,
					value: 5,
				}),
			),
		);
		await timeout(5000);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		await expectCustomerProducts({
			customer,
			active: [pro.id],
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 50,
			planId: pro.id,
			nextResetAt: null,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
