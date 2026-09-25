import { describe, expect, test } from "bun:test";
import { parseBalanceWorkerRolloutOverride } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";

describe("parseBalanceWorkerRolloutOverride", () => {
	test("an explicit value wins in every environment", () => {
		for (const NODE_ENV of ["production", "development", "test", undefined]) {
			expect(
				parseBalanceWorkerRolloutOverride({
					runtimeEnv: { NODE_ENV, BALANCE_WORKER_ROLLOUT_ENABLED: "true" },
				}),
			).toBe(true);
			expect(
				parseBalanceWorkerRolloutOverride({
					runtimeEnv: { NODE_ENV, BALANCE_WORKER_ROLLOUT_ENABLED: "false" },
				}),
			).toBe(false);
		}
	});

	test("unset defers to the rollout config in production only", () => {
		expect(
			parseBalanceWorkerRolloutOverride({
				runtimeEnv: { NODE_ENV: "production" },
			}),
		).toBeUndefined();
		for (const NODE_ENV of ["development", "test", undefined]) {
			expect(
				parseBalanceWorkerRolloutOverride({ runtimeEnv: { NODE_ENV } }),
			).toBe(true);
		}
	});

	test("config defers to the rollout config in every environment", () => {
		for (const NODE_ENV of ["production", "development", "test", undefined]) {
			expect(
				parseBalanceWorkerRolloutOverride({
					runtimeEnv: { NODE_ENV, BALANCE_WORKER_ROLLOUT_ENABLED: "config" },
				}),
			).toBeUndefined();
		}
	});

	test("anything but the three literals counts as unset", () => {
		for (const value of ["1", "0", "FALSE", " false", "TRUE"]) {
			expect(
				parseBalanceWorkerRolloutOverride({
					runtimeEnv: {
						NODE_ENV: "production",
						BALANCE_WORKER_ROLLOUT_ENABLED: value,
					},
				}),
			).toBeUndefined();
		}
	});
});
