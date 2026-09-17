import { describe, expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "./balanceWorker.js";

const valid = { KAFKA_BROKERS: "127.0.0.1:19092", KAFKA_AUTH_MODE: "none" };
const storage = {
	BALANCE_WORKER_CHECKPOINT_BUCKET: "balance-checkpoints",
	BALANCE_WORKER_CHECKPOINT_REGION: "us-east-1",
};

describe("balance worker checkpoint settings", () => {
	test.concurrent("defaults to off without requiring S3 settings", () => {
		expect(createBalanceWorkerEnv(valid)).toMatchObject({
			BALANCE_WORKER_CHECKPOINT_MODE: "off",
		});
	});

	test.concurrent.each(["restore_only", "enabled"])(
		"parses cloneable S3 settings in %s mode and preserves false path-style",
		(mode) => {
			const input = {
				...valid,
				...storage,
				BALANCE_WORKER_CHECKPOINT_MODE: mode,
				BALANCE_WORKER_SQLITE_PATH: ".data/shared.sqlite",
				BALANCE_WORKER_CHECKPOINT_ENDPOINT: "http://127.0.0.1:19000",
				BALANCE_WORKER_CHECKPOINT_FORCE_PATH_STYLE: "false",
			};
			expect(createBalanceWorkerEnv(input)).toMatchObject({
				...storage,
				BALANCE_WORKER_CHECKPOINT_MODE: mode,
				BALANCE_WORKER_SQLITE_PATH: ".data/shared.sqlite",
				BALANCE_WORKER_CHECKPOINT_ENDPOINT: "http://127.0.0.1:19000",
				BALANCE_WORKER_CHECKPOINT_FORCE_PATH_STYLE: false,
			});
			expect(
				createBalanceWorkerEnv({
					...input,
					BALANCE_WORKER_CHECKPOINT_FORCE_PATH_STYLE: "true",
				}),
			).toMatchObject({ BALANCE_WORKER_CHECKPOINT_FORCE_PATH_STYLE: true });
		},
	);

	test.concurrent.each<Record<string, string | undefined>>([
		{ BALANCE_WORKER_CHECKPOINT_MODE: "invalid" },
		{ BALANCE_WORKER_CHECKPOINT_MODE: "enabled" },
		{ BALANCE_WORKER_CHECKPOINT_MODE: "restore_only" },
		{
			...storage,
			BALANCE_WORKER_CHECKPOINT_MODE: "enabled",
			BALANCE_WORKER_CHECKPOINT_PREFIX: "///",
		},
		{
			...storage,
			BALANCE_WORKER_CHECKPOINT_MODE: "enabled",
			BALANCE_WORKER_CHECKPOINT_ENDPOINT: "ftp://localhost",
		},
		{ BALANCE_WORKER_CHECKPOINT_INTERVAL_MS: "0" },
		{
			...storage,
			BALANCE_WORKER_CHECKPOINT_MODE: "enabled",
			BALANCE_WORKER_CHECKPOINT_BUCKET: "",
		},
		{
			...storage,
			BALANCE_WORKER_CHECKPOINT_MODE: "restore_only",
			BALANCE_WORKER_CHECKPOINT_REGION: "",
		},
		{
			...storage,
			BALANCE_WORKER_CHECKPOINT_MODE: "enabled",
			BALANCE_WORKER_SQLITE_PATH: ":memory:",
		},
		{
			...storage,
			BALANCE_WORKER_CHECKPOINT_MODE: "restore_only",
			BALANCE_WORKER_SQLITE_PATH: ":memory:",
		},
		{
			...storage,
			BALANCE_WORKER_CHECKPOINT_MODE: "enabled",
			BALANCE_WORKER_CHECKPOINT_ENDPOINT: "not-a-url",
		},
		{
			...storage,
			BALANCE_WORKER_CHECKPOINT_MODE: "enabled",
			BALANCE_WORKER_CHECKPOINT_FORCE_PATH_STYLE: "yes",
		},
	])("rejects invalid checkpoint configuration %j", (input) => {
		expect(() => createBalanceWorkerEnv({ ...valid, ...input })).toThrow();
	});
});
