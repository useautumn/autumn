import { expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { balanceWorkerEnvToRuntimeConfig } from "../../../src/init/workerConfig.js";

test("a commit carries up to 500 records, so one append in flight per partition is not the cap", () => {
	const env = createBalanceWorkerEnv({
		DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
		KAFKA_BROKERS: "127.0.0.1:19092",
		KAFKA_AUTH_MODE: "none",
		BALANCE_WORKER_PORT: "12982",
	});
	const { writerLimits } = balanceWorkerEnvToRuntimeConfig({
		env,
		endpoint: "http://127.0.0.1:12982",
		groupId: env.BALANCE_WORKER_GROUP_ID,
	});
	expect(writerLimits.maxBatchSize).toBe(500);
});
