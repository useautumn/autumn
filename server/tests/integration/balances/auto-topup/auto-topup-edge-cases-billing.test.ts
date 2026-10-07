import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectCustomerProductOptions } from "@tests/integration/utils/expectCustomerProductOptions";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { AUTO_TOPUP_WAIT_MS } from "./utils/autoTopupEdgeCases";

test.concurrent(
	`${chalk.yellowBright("auto-topup ec4: pro consumable + one-off topup falls back to overage after disable")}`,
	async () => {
		const monthlyIncludedMessages = 100;
		const initialOneOffQuantity = 100;
		const autoTopupThreshold = 20;
		const autoTopupQuantity = 100;
		const firstTrackedUsage = 185;
		const secondTrackedUsage = 215;
		const proBasePrice = 20;
		const consumableMessagePrice = 0.1;

		const consumableMessagesItem = items.consumableMessages({
			includedUsage: monthlyIncludedMessages,
			price: consumableMessagePrice,
		});
		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({
			id: "topup-ec4-pro-mixed",
			items: [consumableMessagesItem, oneOffMessagesItem],
		});

		const { customerId, autumnV2_1, ctx, testClockId } = await initScenario({
			customerId: "auto-topup-ec4",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: initialOneOffQuantity,
						},
					],
				}),
			],
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: autoTopupThreshold,
				quantity: autoTopupQuantity,
			}),
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: firstTrackedUsage,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		const customerAfterAutoTopup =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const expectedBalanceAfterAutoTopup = new Decimal(monthlyIncludedMessages)
			.add(initialOneOffQuantity)
			.sub(firstTrackedUsage)
			.add(autoTopupQuantity)
			.toNumber();
		expectBalanceCorrect({
			customer: customerAfterAutoTopup,
			featureId: TestFeature.Messages,
			remaining: expectedBalanceAfterAutoTopup,
			usage: firstTrackedUsage,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 10,
			latestStatus: "paid",
			latestInvoiceProductId: pro.id,
		});
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: pro.id,
			featureId: TestFeature.Messages,
			quantity: 2,
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({ enabled: false }),
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: secondTrackedUsage,
		});

		const customerAfterDisable =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterDisable,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: firstTrackedUsage + secondTrackedUsage,
		});
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: pro.id,
			featureId: TestFeature.Messages,
			quantity: 2,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		const totalUsageBeforeRenewal = new Decimal(firstTrackedUsage)
			.add(secondTrackedUsage)
			.toNumber();
		const totalGrantedBeforeRenewal = new Decimal(monthlyIncludedMessages)
			.add(initialOneOffQuantity)
			.add(autoTopupQuantity)
			.toNumber();
		const expectedOverageUnits = new Decimal(totalUsageBeforeRenewal)
			.sub(totalGrantedBeforeRenewal)
			.toNumber();
		const expectedRenewalInvoiceTotal = new Decimal(proBasePrice)
			.add(new Decimal(expectedOverageUnits).mul(consumableMessagePrice))
			.toNumber();

		const customerAfterRenewal =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

		expectBalanceCorrect({
			customer: customerAfterRenewal,
			featureId: TestFeature.Messages,
			remaining: monthlyIncludedMessages,
			// usage: 0,
			breakdown: {
				[ResetInterval.OneOff]: {
					usage: 200,
				},
				[ResetInterval.Month]: {
					usage: 0,
				},
			},
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: expectedRenewalInvoiceTotal,
			latestStatus: "paid",
			latestInvoiceProductId: pro.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup ec6: tiered one-off — tier 1 then tier 2 pricing")}`,
	async () => {
		const tieredItem = items.tieredOneOffMessages({
			includedUsage: 50,
			billingUnits: 100,
			tiers: [
				{ to: 200, amount: 10 },
				{ to: "inf", amount: 5 },
			],
		});
		const prod = products.base({
			id: "topup-ec6-tiered",
			items: [tieredItem],
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "auto-topup-ec6",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [prod] }),
			],
			actions: [
				s.attach({
					productId: prod.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		// Initial balance: 50 included + 100 purchased = 150

		// Round 1: quantity=100 → 1 pack, entirely within tier 1 (0–200)
		// Price: 100 × ($10/100) = $10
		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 30,
				quantity: 100,
			}),
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 130,
		});
		// balance = 150 - 130 = 20 → below threshold → auto top-up fires (100 units)

		await timeout(AUTO_TOPUP_WAIT_MS);

		const after1 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after1,
			featureId: TestFeature.Messages,
			remaining: 120, // 20 + 100
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 10,
			latestStatus: "paid",
			latestInvoiceProductId: prod.id,
		});

		// Round 2: increase quantity to 300 → 3 packs, crosses tier boundary
		// Graduated pricing on the single 300-unit top-up:
		//   First 200 in tier 1: 200 × ($10/100) = $20
		//   Remaining 100 in tier 2: 100 × ($5/100) = $5
		//   Total = $25
		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 30,
				quantity: 300,
			}),
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});
		// balance = 120 - 100 = 20 → below threshold → auto top-up fires (300 units)

		await timeout(AUTO_TOPUP_WAIT_MS);

		const after2 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after2,
			featureId: TestFeature.Messages,
			remaining: 320, // 20 + 300
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: 25, // tier 1: $20 + tier 2: $5
			latestStatus: "paid",
			latestInvoiceProductId: prod.id,
		});
	},
);
