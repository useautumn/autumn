import { expect, test } from "bun:test";
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

/** Wait time for SQS auto top-up processing */
const AUTO_TOPUP_WAIT_MS = 40000;

test.concurrent(`${chalk.yellowBright("auto-topup ec1: disabling config prevents subsequent top-ups")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-ec1",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-ec1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 30,
			quantity: 100,
		}),
	});

	// Round 1: Track 180 → balance=20 → top-up fires → balance=120
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 180,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const midBalance = mid.balances[TestFeature.Messages].remaining;
	const expectedMid = new Decimal(200).sub(180).add(100).toNumber();
	expect(midBalance).toBe(expectedMid);

	// Disable auto top-up between rounds
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({ enabled: false }),
	});

	// Round 2: Track 100 → balance=20 → below threshold, but config is disabled → no top-up
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(after.balances[TestFeature.Messages].remaining).toBe(20);
});

test.concurrent(`${chalk.yellowBright("auto-topup ec2: balance depleted to exactly 0 — triggers top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-ec2",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-ec2",
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

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	// Track exactly 100 → balance = 0 → 0 < 20 → should trigger top-up
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(after.balances[TestFeature.Messages].remaining).toBe(100);
});

test.concurrent(`${chalk.yellowBright("auto-topup ec3: quantity < threshold — re-triggers on every track")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-ec3",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-ec3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// threshold=100, quantity=50 → after top-up, balance will still be below threshold
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 130,
			quantity: 50,
		}),
	});

	// Round 1: Track 170 → balance=30 → top-up fires → balance=80
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 170,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const midBalance = mid.balances[TestFeature.Messages].remaining;
	const expectedMid = new Decimal(200).sub(170).add(100).toNumber();
	expect(midBalance).toBe(expectedMid);

	// Round 2: Track just 1 → balance=79 → still below threshold 100 → ANOTHER top-up fires
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const afterBalance = after.balances[TestFeature.Messages].remaining;
	const expectedAfter = new Decimal(130).sub(1).add(100).toNumber();
	expect(afterBalance).toBe(expectedAfter);
});

test.concurrent(`${chalk.yellowBright("auto-topup ec4: pro consumable + one-off topup falls back to overage after disable")}`, async () => {
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
					{ feature_id: TestFeature.Messages, quantity: initialOneOffQuantity },
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
});

test.concurrent(`${chalk.yellowBright("auto-topup ec5: lowered threshold respected on next trigger")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-ec5",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-ec5",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Start with threshold=50
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 50,
			quantity: 100,
		}),
	});

	// Round 1: Track 160 → balance=40 → 40 < 50 → top-up fires → balance=140
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 160,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const midBalance = mid.balances[TestFeature.Messages].remaining;
	const expectedMid = new Decimal(200).sub(160).add(100).toNumber();
	expect(midBalance).toBe(expectedMid);

	// Lower threshold to 10 between rounds
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 10,
			quantity: 100,
		}),
	});

	// Round 2: Track 105 → balance=35 → above new threshold (10) → no top-up
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 105,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(after.balances[TestFeature.Messages].remaining).toBe(35);
});

test.concurrent(`${chalk.yellowBright("auto-topup ec6: tiered one-off — tier 1 then tier 2 pricing")}`, async () => {
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
});
