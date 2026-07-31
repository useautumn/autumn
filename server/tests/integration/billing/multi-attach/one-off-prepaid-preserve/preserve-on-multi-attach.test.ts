/** Multi-attach preserves prepaid balances from every replaced plan. */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ─────────────────────────────────────────────────────────────────────────────
// 1. multiAttach upgrade pro+one-off-prepaid → premium preserves 150 units.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("one-off-preserve multiAttach 1: replacing pro+one-off-prepaid with premium preserves remaining balance")}`,
	async () => {
		const customerId = "one-off-preserve-multi-attach";

		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro-ma", items: [proOneOff] });

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium-ma",
			items: [premiumMessages],
		});

		const { autumnV1, autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		// Burn 50 → balance 150.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// multiAttach swap to premium.
		await autumnV1.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: premium.id }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// premium grants 500; preserved 150 lifetime carryover → 650.
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 650,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("one-off-preserve multiAttach 2: plural replacements preserve every outgoing prepaid balance")}`,
	async () => {
		const customerId = "one-off-preserve-multi-attach-plural";
		const existingMessages = products.pro({
			id: "existing-messages-ma",
			items: [items.oneOffMessages()],
		});
		const existingWords = products.base({
			id: "existing-words-ma",
			group: "words-group-ma",
			items: [items.monthlyPrice({ price: 15 }), items.oneOffWords()],
		});
		const replacementMessages = products.premium({
			id: "replacement-messages-ma",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const replacementWords = products.base({
			id: "replacement-words-ma",
			group: "words-group-ma",
			items: [
				items.monthlyPrice({ price: 30 }),
				items.monthlyWords({ includedUsage: 600 }),
			],
		});
		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [
						existingMessages,
						existingWords,
						replacementMessages,
						replacementWords,
					],
				}),
			],
			actions: [
				s.attach({
					productId: existingMessages.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
				s.attach({
					productId: existingWords.id,
					options: [{ feature_id: TestFeature.Words, quantity: 300 }],
				}),
			],
		});

		await autumnV2_2.billing.multiAttach({
			customer_id: customerId,
			plans: [
				{ plan_id: replacementMessages.id },
				{ plan_id: replacementWords.id },
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 700,
			usage: 0,
		});
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			balance: 900,
			usage: 0,
		});
	},
);
