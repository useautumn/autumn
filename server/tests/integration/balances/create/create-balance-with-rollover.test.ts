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

test.concurrent(`${chalk.yellowBright("balance-rollover-create-1: loose balance rollover applied on reset")}`, async () => {
	const includedGrant = 400;
	const rolloverMax = 500;
	const usage = 250;

	const { customerId, autumnV2_2, ctx } = await initScenario({
		customerId: "balance-rollover-create-1",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

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

	await autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: usage,
	});

	await timeout(3000);

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});

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
				feature_id: TestFeature.Users,
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
				rollover: {
					max: 50,
					length: 1,
					duration: RolloverExpiryDurationType.Month,
				},
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("balance-rollover-create-4: expires_at before next rollover is rejected")}`, async () => {
	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "balance-rollover-create-4",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

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
