import { describe, expect, test } from "bun:test";
import { parseBalanceWorkerRolloutEnabled } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";

describe("parseBalanceWorkerRolloutEnabled", () => {
	test("on unless the env says exactly false", () => {
		expect(parseBalanceWorkerRolloutEnabled({ runtimeEnv: {} })).toBe(true);
		for (const value of ["true", "1", "0", "FALSE", " false"]) {
			expect(
				parseBalanceWorkerRolloutEnabled({
					runtimeEnv: { BALANCE_WORKER_ROLLOUT_ENABLED: value },
				}),
			).toBe(true);
		}
		expect(
			parseBalanceWorkerRolloutEnabled({
				runtimeEnv: { BALANCE_WORKER_ROLLOUT_ENABLED: "false" },
			}),
		).toBe(false);
	});
});
