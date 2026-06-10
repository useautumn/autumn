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

// custom/internal-model: input_cost=5 $/M, output_cost=15 $/M, markup=0%

// ═══════════════════════════════════════════════════════════════════
// TRACK-TOKENS-PAID-1: prepaid AI credits deduct through purchased balance
// ═══════════════════════════════════════════════════════════════════

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

		// 2 included + 3 purchased = 5
		const customerBefore =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerBefore,
			featureId: TestFeature.AiCredits,
			granted: 5,
			remaining: 5,
		});

		// (5*100000 + 15*100000) / 1e6 = $2.00
		const trackRes1: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 100000,
			output_tokens: 100000,
		});
		expect(trackRes1.value).toBeCloseTo(2, 10);

		// Cost $4 > remaining 3 with reject — errors, balance unchanged
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

		// Cost $3.00 drains the remaining balance exactly
		const trackRes2: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 150000,
			output_tokens: 150000,
		});
		expect(trackRes2.value).toBeCloseTo(3, 10);

		// Cached vs DB agreement (mutation-log sync is async)
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

// ═══════════════════════════════════════════════════════════════════
// TRACK-TOKENS-PAID-2: consumable AI credit overage lands on the invoice
// ═══════════════════════════════════════════════════════════════════

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

		// (5*200000 + 15*200000) / 1e6 = $4.00 exactly
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

		// Renewal invoice: $20 pro base + 3 overage units × $1 = $23.
		// Invoice lands via Stripe webhook — poll briefly before asserting.
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

		// Balance resets for the new cycle
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
