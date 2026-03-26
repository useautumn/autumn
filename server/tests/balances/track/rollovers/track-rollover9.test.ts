import { expect, test } from "bun:test";
import { type ApiCustomerV3, RolloverExpiryDurationType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { resetAndGetCusEnt } from "./rolloverTestUtils.js";

// ═══════════════════════════════════════════════════════════════════
// TRACK-ROLLOVER9: Unlimited rollover config (no max, forever expiry)
// Repeatedly resets and verifies that rollover amounts stay constant
// (equal to allowance) and do NOT double each period.
// ═══════════════════════════════════════════════════════════════════

const ALLOWANCE = 100;

test.concurrent(`${chalk.yellowBright("track-rollover9: unlimited rollover — repeated resets produce constant rollover amounts, not doubling")}`, async () => {
	const rolloverConfig = {
		max: null,
		length: 1,
		duration: RolloverExpiryDurationType.Forever,
	};

	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: ALLOWANCE,
		rolloverConfig,
	});

	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const customerId = "track-rollover9";

	const { autumnV1, ctx, customer } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Verify initial state: just the allowance, no rollovers
	const initialCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const initialMessages = initialCustomer.features[TestFeature.Messages];
	expect(initialMessages?.balance).toBe(ALLOWANCE);

	// ─── RESET 1: No usage, rollover should capture the full allowance ───
	await resetAndGetCusEnt({
		ctx,
		customer: customer!,
		productGroup: customerId,
		featureId: TestFeature.Messages,
	});

	const afterReset1 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const msgesReset1 = afterReset1.features[TestFeature.Messages];

	expect(msgesReset1?.rollovers?.length).toBe(1);
	expect(msgesReset1?.rollovers?.[0].balance).toBe(ALLOWANCE);
	expect(msgesReset1?.balance).toBe(ALLOWANCE + ALLOWANCE);

	// Verify DB (non-cached) matches
	await timeout(2000);
	const dbAfterReset1 = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	const dbMsgesReset1 = dbAfterReset1.features[TestFeature.Messages];
	expect(dbMsgesReset1?.rollovers?.[0].balance).toBe(ALLOWANCE);
	expect(dbMsgesReset1?.balance).toBe(ALLOWANCE + ALLOWANCE);

	// ─── RESET 2: Still no usage. New rollover should be ALLOWANCE, not 200 ───
	await resetAndGetCusEnt({
		ctx,
		customer: customer!,
		productGroup: customerId,
		featureId: TestFeature.Messages,
	});

	const afterReset2 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const msgesReset2 = afterReset2.features[TestFeature.Messages];

	expect(msgesReset2?.rollovers?.length).toBe(2);
	// Each individual rollover should be exactly ALLOWANCE (100), NOT doubling
	expect(msgesReset2?.rollovers?.[0].balance).toBe(ALLOWANCE);
	expect(msgesReset2?.rollovers?.[1].balance).toBe(ALLOWANCE);
	// Total = allowance + rollover1 + rollover2 = 300
	expect(msgesReset2?.balance).toBe(ALLOWANCE * 3);

	// Verify DB
	await timeout(2000);
	const dbAfterReset2 = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	const dbMsgesReset2 = dbAfterReset2.features[TestFeature.Messages];
	expect(dbMsgesReset2?.rollovers?.[0].balance).toBe(ALLOWANCE);
	expect(dbMsgesReset2?.rollovers?.[1].balance).toBe(ALLOWANCE);
	expect(dbMsgesReset2?.balance).toBe(ALLOWANCE * 3);

	// ─── RESET 3: Third reset — still ALLOWANCE per rollover ───
	await resetAndGetCusEnt({
		ctx,
		customer: customer!,
		productGroup: customerId,
		featureId: TestFeature.Messages,
	});

	const afterReset3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const msgesReset3 = afterReset3.features[TestFeature.Messages];

	expect(msgesReset3?.rollovers?.length).toBe(3);
	expect(msgesReset3?.rollovers?.[0].balance).toBe(ALLOWANCE);
	expect(msgesReset3?.rollovers?.[1].balance).toBe(ALLOWANCE);
	expect(msgesReset3?.rollovers?.[2].balance).toBe(ALLOWANCE);
	// Total = allowance + 3 rollovers = 400
	expect(msgesReset3?.balance).toBe(ALLOWANCE * 4);

	// Verify DB
	await timeout(2000);
	const dbAfterReset3 = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	const dbMsgesReset3 = dbAfterReset3.features[TestFeature.Messages];
	expect(dbMsgesReset3?.rollovers?.[0].balance).toBe(ALLOWANCE);
	expect(dbMsgesReset3?.rollovers?.[1].balance).toBe(ALLOWANCE);
	expect(dbMsgesReset3?.rollovers?.[2].balance).toBe(ALLOWANCE);
	expect(dbMsgesReset3?.balance).toBe(ALLOWANCE * 4);

	// ─── RESET 4: Fourth reset — guard against exponential growth ───
	await resetAndGetCusEnt({
		ctx,
		customer: customer!,
		productGroup: customerId,
		featureId: TestFeature.Messages,
	});

	const afterReset4 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const msgesReset4 = afterReset4.features[TestFeature.Messages];

	expect(msgesReset4?.rollovers?.length).toBe(4);
	for (const rollover of msgesReset4?.rollovers ?? []) {
		expect(rollover.balance).toBe(ALLOWANCE);
	}
	// Total = allowance + 4 rollovers = 500
	expect(msgesReset4?.balance).toBe(ALLOWANCE * 5);

	// Final DB verification
	await timeout(2000);
	const dbAfterReset4 = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	const dbMsgesReset4 = dbAfterReset4.features[TestFeature.Messages];
	for (const rollover of dbMsgesReset4?.rollovers ?? []) {
		expect(rollover.balance).toBe(ALLOWANCE);
	}
	expect(dbMsgesReset4?.balance).toBe(ALLOWANCE * 5);
});
