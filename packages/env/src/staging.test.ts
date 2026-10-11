import { describe, expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "./balanceWorker/balanceWorkerEnv.js";
import { isStagingEnv } from "./staging.js";

describe("isStagingEnv", () => {
	test("the production region is never staging, even with the flag", () => {
		expect(
			isStagingEnv({
				runtimeEnv: { STAGING_ENVIRONMENT: "true", AWS_REGION: "us-east-2" },
			}),
		).toBe(false);
	});

	test("the staging region with the flag is staging", () => {
		expect(
			isStagingEnv({
				runtimeEnv: { STAGING_ENVIRONMENT: "true", AWS_REGION: "us-east-1" },
			}),
		).toBe(true);
	});

	test("AWS_DEFAULT_REGION stands in for a missing AWS_REGION", () => {
		expect(
			isStagingEnv({
				runtimeEnv: {
					STAGING_ENVIRONMENT: "true",
					AWS_DEFAULT_REGION: "us-east-2",
				},
			}),
		).toBe(false);
	});

	test("without the flag nothing is staging", () => {
		expect(isStagingEnv({ runtimeEnv: { AWS_REGION: "us-east-1" } })).toBe(
			false,
		);
	});

	test("an unknown region keeps the flag's answer", () => {
		expect(isStagingEnv({ runtimeEnv: { STAGING_ENVIRONMENT: "true" } })).toBe(
			true,
		);
	});
});

describe("balance worker cold start wiring", () => {
	const base = {
		KAFKA_BROKERS: "localhost:19092",
		DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
		KAFKA_AUTH_MODE: "none",
	};

	test("a production-region worker never turns staging on", () => {
		expect(
			createBalanceWorkerEnv({
				...base,
				STAGING_ENVIRONMENT: "true",
				AWS_REGION: "us-east-2",
			}).BALANCE_WORKER_STAGING,
		).toBe(false);
	});

	test("a staging-region worker with the flag turns staging on", () => {
		expect(
			createBalanceWorkerEnv({
				...base,
				STAGING_ENVIRONMENT: "true",
				AWS_REGION: "us-east-1",
			}).BALANCE_WORKER_STAGING,
		).toBe(true);
	});
});
