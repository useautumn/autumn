import { describe, expect, test } from "bun:test";
import { getBalanceWorkerPartitionCount } from "./balanceWorkerPartitionCount.js";

describe("balance worker partition count", () => {
	test("reads the deployment's count", () => {
		expect(
			getBalanceWorkerPartitionCount({
				runtimeEnv: {
					NODE_ENV: "production",
					BALANCE_WORKER_PARTITION_COUNT: "128",
				},
			}),
		).toBe(128);
	});

	test("the local stack keeps its small count when unset", () => {
		for (const NODE_ENV of ["development", "test", undefined])
			expect(getBalanceWorkerPartitionCount({ runtimeEnv: { NODE_ENV } })).toBe(
				4,
			);
	});

	test("production refuses to guess", () => {
		expect(() =>
			getBalanceWorkerPartitionCount({
				runtimeEnv: { NODE_ENV: "production" },
			}),
		).toThrow("BALANCE_WORKER_PARTITION_COUNT is required in production");
	});

	test("rejects counts outside 1-512", () => {
		for (const value of ["0", "513", "12.5", "abc"])
			expect(() =>
				getBalanceWorkerPartitionCount({
					runtimeEnv: { BALANCE_WORKER_PARTITION_COUNT: value },
				}),
			).toThrow();
	});
});
