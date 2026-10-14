import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { waitForRedisReady } from "@/external/redis/initRedis.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";

const testCase = "balances-create-flush-unsynced-balances";

const GRANT = 100;
const SPEND = 5;

const getMessagesRemaining = (customer: ApiCustomer) => {
	const balance = customer.balances[TestFeature.Messages] as {
		current_balance?: number;
		remaining?: number;
	};
	return balance.remaining ?? balance.current_balance;
};

describe.skipIf(isBalanceWorkerRoute())(
	`${chalk.yellowBright("balances.create must not lose unsynced deductions")}`,
	() => {
		const customerId = testCase;
		const autumn = new AutumnInt({
			version: ApiVersion.V2_1,
			secretKey: ctx.orgSecretKey,
		});

		beforeAll(async () => {
			await waitForRedisReady(ctx.redisV2, "customer-redis", 5000);

			await autumn.customers.delete(customerId).catch(() => {});

			await autumn.customers.create({ id: customerId, name: testCase });

			await autumn.balances.create({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				included_grant: GRANT,
				reset: { interval: ResetInterval.OneOff },
				balance_id: "starter",
			});
		});

		test("keeps a deduction that balances.create invalidates before its sync lands", async () => {
			const fullSubject = await getOrSetCachedFullSubject({
				ctx,
				customerId,
				source: "test-setup",
			});

			const messagesFeature = ctx.features.find(
				(feature) => feature.id === TestFeature.Messages,
			)!;

			await executeRedisDeductionV2({
				ctx,
				deductions: [{ feature: messagesFeature, deduction: SPEND }],
				fullSubject,
				deductionOptions: { overageBehaviour: "cap" },
			});

			const cachedBeforeGrant =
				await autumn.customers.get<ApiCustomer>(customerId);
			expect(getMessagesRemaining(cachedBeforeGrant)).toBe(GRANT - SPEND);

			await autumn.balances.create({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				included_grant: GRANT,
				reset: { interval: ResetInterval.OneOff },
				balance_id: "second",
			});

			const balanceKey = buildSharedFullSubjectBalanceKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				featureId: TestFeature.Messages,
			});
			expect(await ctx.redisV2.hlen(balanceKey)).toBe(0);

			const dbCustomer = await autumn.customers.get<ApiCustomer>(customerId, {
				skip_cache: "true",
			});
			expect(getMessagesRemaining(dbCustomer)).toBe(GRANT * 2 - SPEND);

			const rebuiltCustomer =
				await autumn.customers.get<ApiCustomer>(customerId);
			expect(getMessagesRemaining(rebuiltCustomer)).toBe(GRANT * 2 - SPEND);
		});
	},
);
