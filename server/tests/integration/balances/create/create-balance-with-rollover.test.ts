import { test } from "bun:test";
import {
	type ApiCustomerV5,
	ResetInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// BALANCE-ROLLOVER-CREATE-1: Happy path — rollover applied on reset
//
// Create a loose messages balance with a monthly reset + rollover config.
// Track partial usage, trigger a lazy reset, and verify:
//   - fresh grant is re-added
//   - unused balance rolls over as a rollover entry (capped by max)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("balance-rollover-create-1: loose balance rollover applied on reset")}`, async () => {
	const includedGrant = 400;
	const rolloverMax = 500;
	const usage = 250;

	const { customerId, autumnV2_2, ctx } = await initScenario({
		customerId: "balance-rollover-create-1",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	// Create loose balance with rollover
	await autumnV2_2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: includedGrant,
		reset: { interval: ResetInterval.Month },
		rollover: {
			max: rolloverMax,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});

	// Track partial usage
	await autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: usage,
	});

	await timeout(3000);

	// Trigger a reset (lazy)
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});

	// Unused (400 - 250) = 150 rolls over; capped by max=500 → 150
	const expectedRollover = Math.min(includedGrant - usage, rolloverMax);
	const expectedRemaining = includedGrant + expectedRollover;

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: expectedRemaining,
		usage: 0,
		rollovers: [{ balance: expectedRollover }],
	});
});

// ═══════════════════════════════════════════════════════════════════
// BALANCE-ROLLOVER-CREATE-2: Rejection — rollover on continuous-use feature
//
// Rollover is not meaningful for continuous-use features. The API should
// reject the request.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("balance-rollover-create-2: rollover on continuous-use feature is rejected")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "balance-rollover-create-2",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV2.balances.create({
				customer_id: customerId,
				feature_id: TestFeature.Users, // continuous-use
				included_grant: 5,
				reset: { interval: ResetInterval.Month },
				rollover: {
					max: 10,
					length: 1,
					duration: RolloverExpiryDurationType.Month,
				},
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════
// BALANCE-ROLLOVER-CREATE-3: Rejection — rollover on one-time balance
//
// A balance without a reset interval is one-time / never resets, so
// rollover makes no sense. The API should reject the request.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("balance-rollover-create-3: rollover on one-time balance is rejected")}`, async () => {
	const { customerId, autumnV2 } = await initScenario({
		customerId: "balance-rollover-create-3",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV2.balances.create({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				included_grant: 100,
				// no reset → one-time balance
				rollover: {
					max: 50,
					length: 1,
					duration: RolloverExpiryDurationType.Month,
				},
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════
// BALANCE-ROLLOVER-CREATE-4: Rejection — expires_at before next rollover
//
// A rollover event fires at the next reset. If expires_at occurs before
// that next reset, the rollover would never take effect. The API should
// reject the request.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("balance-rollover-create-4: expires_at before next rollover is rejected")}`, async () => {
	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "balance-rollover-create-4",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	// expires_at is 1 day from now, but reset is monthly → next rollover
	// would be ~1 month from now, well after expiry.
	const expiresAt = Date.now() + 1000 * 60 * 60 * 24;

	await expectAutumnError({
		func: async () => {
			await autumnV2_2.balances.create({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				included_grant: 100,
				reset: { interval: ResetInterval.Month },
				expires_at: expiresAt,
				rollover: {
					max: 50,
					length: 1,
					duration: RolloverExpiryDurationType.Month,
				},
			});
		},
	});
});
