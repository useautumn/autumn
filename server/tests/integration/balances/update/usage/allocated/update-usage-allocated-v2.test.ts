import { test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("update-usage allocated v2: overage is billed at cycle end")}`,
	async () => {
		const customerId = "update-usage-allocated-v2";
		const pro = products.pro({
			id: "pro",
			items: [
				items.allocatedV2Workflows({
					includedUsage: 1,
					pricePerUnit: 5,
				}),
			],
		});

		const { autumnV1, autumnV2_3, ctx, testClockId } = await initScenario({
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

		await autumnV2_3.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Workflows,
			usage: 6,
		});

		const customerAfterUpdate =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterUpdate,
			featureId: TestFeature.Workflows,
			remaining: 0,
			usage: 6,
			planId: pro.id,
			nextResetAt: null,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});

		const customerFromDb = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: customerFromDb,
			featureId: TestFeature.Workflows,
			remaining: 0,
			usage: 6,
			planId: pro.id,
			nextResetAt: null,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: 45,
			latestInvoiceProductId: pro.id,
		});
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: customerV3.invoices![0].stripe_id,
			expectedTotal: 45,
			expectedLineItems: [
				{
					isBasePrice: true,
					productId: pro.id,
					totalAmount: 20,
					billingTiming: "in_advance",
					direction: "charge",
				},
				{
					featureId: TestFeature.Workflows,
					productId: pro.id,
					totalAmount: 25,
					billingTiming: "in_arrear",
					direction: "charge",
				},
			],
		});

		const customerAfterRenewal =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterRenewal,
			featureId: TestFeature.Workflows,
			remaining: 0,
			usage: 6,
			planId: pro.id,
			nextResetAt: null,
		});
	},
);
