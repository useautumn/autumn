import { test } from "bun:test";
import {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
	ProductItemInterval,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("invoice.created allocated v2: renewal bills overage and does not reset")}`,
	async () => {
		const customerId = "inv-created-allocated-v2-overage";
		const pro = products.pro({
			id: "pro",
			items: [items.allocatedV2Users({ includedUsage: 2 })],
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
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 5,
		});
		await timeout(2000);

		const customerAfterTrack =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterTrack,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 5,
			planId: pro.id,
			nextResetAt: null,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
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
			latestTotal: 50,
			latestInvoiceProductId: pro.id,
		});

		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: customerV3.invoices![0].stripe_id,
			expectedTotal: 50,
			expectedLineItems: [
				{
					isBasePrice: true,
					productId: pro.id,
					totalAmount: 20,
					billingTiming: "in_advance",
					direction: "charge",
				},
				{
					featureId: TestFeature.Users,
					productId: pro.id,
					totalAmount: 30,
					billingTiming: "in_arrear",
					direction: "charge",
				},
			],
		});

		const customerAfterRenewal =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterRenewal,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 5,
			planId: pro.id,
			nextResetAt: null,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice.created allocated v2: mixed intervals bill only due item")}`,
	async () => {
		const customerId = "inv-created-allocated-v2-mixed-interval";
		const pro = products.pro({
			id: "pro",
			items: [
				items.allocatedV2Users({ includedUsage: 2 }),
				items.allocatedV2Workflows({
					pricePerUnit: 5,
					includedUsage: 1,
					interval: ProductItemInterval.Quarter,
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
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 5,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Workflows,
			value: 6,
		});
		await timeout(2000);

		let currentEpochMs = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: 50,
			latestInvoiceProductId: pro.id,
		});
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: customerV3.invoices![0].stripe_id,
			expectedTotal: 50,
			expectedLineItems: [
				{
					isBasePrice: true,
					productId: pro.id,
					totalAmount: 20,
					billingTiming: "in_advance",
					direction: "charge",
				},
				{
					featureId: TestFeature.Users,
					productId: pro.id,
					totalAmount: 30,
					billingTiming: "in_arrear",
					direction: "charge",
				},
				{
					featureId: TestFeature.Workflows,
					productId: pro.id,
					billingTiming: "in_arrear",
					direction: "charge",
					count: 0,
				},
			],
		});

		const customerAfterRenewal =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterRenewal,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 5,
			planId: pro.id,
			nextResetAt: null,
		});
		expectBalanceCorrect({
			customer: customerAfterRenewal,
			featureId: TestFeature.Workflows,
			remaining: 0,
			usage: 6,
			planId: pro.id,
			nextResetAt: null,
		});

		currentEpochMs = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs,
			withPause: true,
		});

		const customerMonth2 =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerMonth2,
			count: 3,
			latestTotal: 50,
			latestInvoiceProductId: pro.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs,
			withPause: true,
		});

		const customerQuarter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerQuarter,
			count: 4,
			latestTotal: 75,
			latestInvoiceProductId: pro.id,
		});
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: customerQuarter.invoices![0].stripe_id,
			expectedTotal: 75,
			expectedLineItems: [
				{
					isBasePrice: true,
					productId: pro.id,
					totalAmount: 20,
					billingTiming: "in_advance",
					direction: "charge",
				},
				{
					featureId: TestFeature.Users,
					productId: pro.id,
					totalAmount: 30,
					billingTiming: "in_arrear",
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
	},
);
