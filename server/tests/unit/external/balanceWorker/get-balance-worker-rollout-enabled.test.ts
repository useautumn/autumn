import { describe, expect, test } from "bun:test";
import { parseBalanceWorkerRolloutOverride } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";

const PRODUCTION_ENVS = [
	{ NODE_ENV: "production" },
	{ NODE_ENV: "development", ENV_FILE: ".env.prod" },
];
const LOCAL_ENVS = [
	{ NODE_ENV: "development" },
	{ NODE_ENV: "test" },
	{ NODE_ENV: "development", ENV_FILE: ".env" },
	{},
];
const STAGING_ENV = { NODE_ENV: "production", STAGING_ENVIRONMENT: "true" };

describe("parseBalanceWorkerRolloutOverride", () => {
	test("true and false force the answer everywhere", () => {
		for (const runtimeEnv of [...PRODUCTION_ENVS, ...LOCAL_ENVS]) {
			expect(
				parseBalanceWorkerRolloutOverride({
					runtimeEnv: { ...runtimeEnv, BALANCE_WORKER_ROLLOUT_ENABLED: "true" },
				}),
			).toBe(true);
			expect(
				parseBalanceWorkerRolloutOverride({
					runtimeEnv: {
						...runtimeEnv,
						BALANCE_WORKER_ROLLOUT_ENABLED: "false",
					},
				}),
			).toBe(false);
		}
	});

	test("config defers to the rollout config everywhere", () => {
		for (const runtimeEnv of [...PRODUCTION_ENVS, ...LOCAL_ENVS]) {
			expect(
				parseBalanceWorkerRolloutOverride({
					runtimeEnv: {
						...runtimeEnv,
						BALANCE_WORKER_ROLLOUT_ENABLED: "config",
					},
				}),
			).toBeUndefined();
		}
	});

	test("unset defers to the config against production, incl. prod-secret scripts on NODE_ENV=development", () => {
		for (const runtimeEnv of PRODUCTION_ENVS) {
			expect(parseBalanceWorkerRolloutOverride({ runtimeEnv })).toBeUndefined();
		}
	});

	test("unset is the local default on a local stack and on staging", () => {
		for (const runtimeEnv of [...LOCAL_ENVS, STAGING_ENV]) {
			expect(parseBalanceWorkerRolloutOverride({ runtimeEnv })).toBe(true);
		}
	});

	test("anything else counts as unset", () => {
		for (const value of ["1", "0", "TRUE", " false"]) {
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
