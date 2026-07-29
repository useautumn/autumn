import { test } from "bun:test";
import { type CheckResponseV2, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("scenario: delete balance preserves overage")}`, async () => {
	const customerId = "delete-balance-overage-dashboard";

	const { autumnV2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 100,
		balance_id: "messages-used-only",
		reset: { interval: ResetInterval.Month },
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		balance_id: "messages-used-only",
		remaining: 60,
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		included_grant: 200,
		balance_id: "words-used-only",
		reset: { interval: ResetInterval.Month },
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		balance_id: "words-used-only",
		remaining: 125,
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Storage,
		included_grant: 100,
		balance_id: "storage-used-delete",
	});
	await autumnV2.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Storage,
		included_grant: 200,
		balance_id: "storage-receiver",
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Storage,
		balance_id: "storage-used-delete",
		remaining: 40,
	});

	const [messages, words, storage] = await Promise.all([
		autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		}),
		autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			skip_cache: true,
		}),
		autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Storage,
			skip_cache: true,
		}),
	]);

	console.log("delete balance overage scenario:", {
		customerId,
		overageCases: [
			{
				featureId: TestFeature.Messages,
				balanceId: "messages-used-only",
				deleteBehavior: "no receiver; used 40 should be kept as overage",
				balance: messages.balance,
			},
			{
				featureId: TestFeature.Words,
				balanceId: "words-used-only",
				deleteBehavior: "no receiver; used 75 should be kept as overage",
				balance: words.balance,
			},
		],
		deductFromOtherCase: {
			featureId: TestFeature.Storage,
			deleteBalanceId: "storage-used-delete",
			receiverBalanceId: "storage-receiver",
			deleteBehavior: "receiver exists; used 60 can be deducted from receiver",
			balance: storage.balance,
		},
	});
});
