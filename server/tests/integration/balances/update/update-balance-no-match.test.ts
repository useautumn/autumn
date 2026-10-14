import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const testCase = "update-balance-no-match";

const GRANT = 100;
const TOP_UP = 40;

const getMessagesRemaining = (customer: ApiCustomer) => {
	const balance = customer.balances[TestFeature.Messages] as {
		current_balance?: number;
		remaining?: number;
	};
	return balance.remaining ?? balance.current_balance;
};

const captureError = async (run: () => Promise<unknown>) =>
	run().then(
		() => null,
		(error: { message?: string; code?: string }) => error,
	);

describe(`${chalk.yellowBright("balances.update rejects a mutation that matches no balance")}`, () => {
	const customerId = testCase;
	const autumn = new AutumnInt({
		version: ApiVersion.V2_1,
		secretKey: ctx.orgSecretKey,
	});

	beforeAll(async () => {
		await autumn.customers.delete(customerId).catch(() => {});
		await autumn.customers.create({ id: customerId, name: testCase });
	});

	test("rejects when the customer has no entitlement for the feature", async () => {
		const error = await captureError(() =>
			autumn.balances.update({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				add_to_balance: TOP_UP,
			}),
		);

		expect(error).not.toBeNull();
		expect(error?.code).toBe("customer_entitlement_not_found");
		expect(error?.message).toContain(TestFeature.Messages);
		expect(error?.message).toContain("billing.attach");
		expect(error?.message).toContain("balances.create");
	});

	test("rejects a balance_id that matches nothing, naming it", async () => {
		await autumn.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: GRANT,
			reset: { interval: ResetInterval.OneOff },
			balance_id: "starter",
		});

		const error = await captureError(() =>
			autumn.balances.update({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				balance_id: "startr",
				add_to_balance: TOP_UP,
			}),
		);

		expect(error).not.toBeNull();
		expect(error?.code).toBe("customer_entitlement_not_found");
		expect(error?.message).toContain("balance_id 'startr'");

		const untouched = await autumn.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		expect(getMessagesRemaining(untouched)).toBe(GRANT);
	});

	test("still applies a mutation that resolves a live balance", async () => {
		await autumn.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: "starter",
			add_to_balance: TOP_UP,
		});

		const updated = await autumn.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		expect(getMessagesRemaining(updated)).toBe(GRANT + TOP_UP);
	});
});
