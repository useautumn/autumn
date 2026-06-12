import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("immediate-switch-allocated v2: usage carries over without track billing")}`,
	async () => {
		const customerId = "imm-switch-allocated-v2-carryover";

		const pro = products.pro({
			id: "pro",
			items: [items.allocatedV2Users({ includedUsage: 2 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.allocatedV2Users({ includedUsage: 5 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
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
			latestTotal: 20,
		});

		const preview = await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				plan_id: premium.id,
			},
		);
		expect(preview.total).toBe(30);

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 30,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Users,
			remaining: 1,
			usage: 4,
			planId: premium.id,
			nextResetAt: null,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

// Regression: free usage above the new allocated-v2 grant must not become a midcycle invoice.
// The carried usage should stay on the replacement product and bill in arrears.
test.concurrent(
	`${chalk.yellowBright("immediate-switch-allocated v2: free usage carries to paid seats without midcycle invoice")}`,
	async () => {
		const customerId = "imm-switch-allocated-v2-free-to-paid-carry";

		const free = products.base({
			id: "free",
			items: [items.monthlyUsers({ includedUsage: 10 })],
		});
		const pro = products.base({
			id: "pro",
			items: [items.allocatedV2Users({ includedUsage: 1 })],
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [s.billing.attach({ productId: free.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 8,
		});
		await timeout(2000);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 0,
		});

		const preview = await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				plan_id: pro.id,
			},
		);
		expect(preview.total).toBe(0);
		expect(preview.line_items).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ feature_id: TestFeature.Users }),
			]),
		);

		const result = await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});
		expect(result.invoice).toBeUndefined();

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			active: [pro.id],
			notPresent: [free.id],
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 8,
			planId: pro.id,
			nextResetAt: null,
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 0,
		});
	},
);
