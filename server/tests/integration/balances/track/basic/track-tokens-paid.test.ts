import { expect, test } from "bun:test";

import type {
	ApiCustomerV3,
	ApiCustomerV5,
	TrackResponseV3,
} from "@autumn/shared";
import { ErrCode } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("track-tokens-paid-1: prepaid AI credits deduct through purchased balance")}`,
	async () => {
		const prepaidItem = items.prepaid({
			featureId: TestFeature.AiCredits,
			price: 1,
			billingUnits: 1,
			includedUsage: 2,
		});
		const prepaidProduct = products.pro({
			id: "prepaid-ai",
			items: [prepaidItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-paid-1",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [prepaidProduct] }),
			],
			actions: [
				s.attach({
					productId: prepaidProduct.id,
					options: [{ feature_id: TestFeature.AiCredits, quantity: 3 }],
				}),
			],
		});

		const customerBefore =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerBefore,
			featureId: TestFeature.AiCredits,
			granted: 5,
			remaining: 5,
		});

		const trackRes1: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 100000,
			output_tokens: 100000,
		});
		expect(trackRes1.value).toBeCloseTo(2, 10);

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_2.post("/track_tokens", {
					customer_id: customerId,
					feature_id: TestFeature.AiCredits,
					model_id: "custom/internal-model",
					input_tokens: 200000,
					output_tokens: 200000,
					overage_behavior: "reject",
				}),
		});

		const customerMid =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerMid,
			featureId: TestFeature.AiCredits,
			remaining: 3,
			usage: 2,
		});

		const trackRes2: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 150000,
			output_tokens: 150000,
		});
		expect(trackRes2.value).toBeCloseTo(3, 10);

		await timeout(6000);
		const customerNonCached = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: customerNonCached,
			featureId: TestFeature.AiCredits,
			granted: 5,
			remaining: 0,
			usage: 5,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-paid-2: consumable AI credit overage lands on the renewal invoice")}`,
	async () => {
		const consumableItem = items.consumable({
			featureId: TestFeature.AiCredits,
			includedUsage: 1,
			price: 1,
			billingUnits: 1,
		});
		const proProduct = products.pro({
			id: "consumable-ai",
			items: [consumableItem],
		});

		const { customerId, autumnV1, autumnV2_2, testClockId } =
			await initScenario({
				customerId: "track-tokens-paid-2",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proProduct] }),
				],
				actions: [s.attach({ productId: proProduct.id })],
			});

		const trackRes: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 200000,
			output_tokens: 200000,
		});
		expect(trackRes.value).toBeCloseTo(4, 10);

		const customerMid =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerMid,
			featureId: TestFeature.AiCredits,
			remaining: 0,
			usage: 4,
		});

		await timeout(2000);
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		for (let attempt = 0; attempt < 5; attempt++) {
			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			if ((customer.invoices?.length ?? 0) >= 2) break;
			await timeout(10000);
		}
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 23,
			latestInvoiceProductId: proProduct.id,
		});

		const customerReset =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerReset,
			featureId: TestFeature.AiCredits,
			remaining: 1,
			usage: 0,
		});
	},
);
