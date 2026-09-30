import { expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { balanceWorkerEnvToRuntimeConfig } from "../../../src/init/workerConfig.js";

const localEnvironment = {
	KAFKA_BROKERS: "127.0.0.1:19092",
	KAFKA_AUTH_MODE: "none",
};

function timingsOf(overrides: Record<string, string>) {
	const env = createBalanceWorkerEnv({
		DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
		...localEnvironment,
		...overrides,
	});
	return balanceWorkerEnvToRuntimeConfig({
		env,
		endpoint: "http://127.0.0.1:8082",
		groupId: env.BALANCE_WORKER_GROUP_ID,
	}).timings;
}

test("the worker's own fetch wait defaults to 250 ms", () => {
	expect(timingsOf({}).fetchMaxWaitTimeMs).toBe(250);
});

test("the worker's own fetch wait is read from the environment", () => {
	expect(
		timingsOf({ BALANCE_WORKER_FETCH_MAX_WAIT_MS: "1000" }).fetchMaxWaitTimeMs,
	).toBe(1000);
});
