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
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("create-entity allocated v2: create/delete adjusts usage without mid-cycle billing")}`,
	async () => {
		const customerId = "create-entity-allocated-v2";
		const pro = products.pro({
			id: "pro",
			items: [items.allocatedV2Users({ includedUsage: 1 })],
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

		await autumnV2_3.entities.create(customerId, [
			{ id: "user-1", name: "User 1", feature_id: TestFeature.Users },
			{ id: "user-2", name: "User 2", feature_id: TestFeature.Users },
			{ id: "user-3", name: "User 3", feature_id: TestFeature.Users },
		]);
		await timeout(2000);

		const customerAfterCreate =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterCreate,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 3,
			planId: pro.id,
			nextResetAt: null,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});

		await autumnV2_3.entities.delete(customerId, "user-1");
		await timeout(2000);

		const customerAfterDelete =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterDelete,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 2,
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
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 2,
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
			latestTotal: 30,
			latestInvoiceProductId: pro.id,
		});
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: customerV3.invoices![0].stripe_id,
			expectedTotal: 30,
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
					totalAmount: 10,
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
			usage: 2,
			planId: pro.id,
			nextResetAt: null,
		});
	},
);
