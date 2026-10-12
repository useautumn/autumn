import { describe, expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { createWorkerEdgeConfigs } from "../../../src/edgeConfig/createWorkerEdgeConfigs.js";
import { createMemoryS3Client } from "../../fixtures/subjectSnapshotsStore.js";

const workerEnv = (runtimeEnv: Record<string, string>) =>
	createBalanceWorkerEnv({
		KAFKA_BROKERS: "localhost:19092",
		DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
		KAFKA_AUTH_MODE: "none",
		...runtimeEnv,
	});

const coldStartStoreFor = (runtimeEnv: Record<string, string>) =>
	createWorkerEdgeConfigs({
		ctx: { s3Client: createMemoryS3Client() },
		config: {
			location: { bucket: "test", region: "us-east-2" },
			coldStart: workerEnv(runtimeEnv).BALANCE_WORKER_STAGING,
		},
	}).coldStart;

describe("cold start wiring", () => {
	test("a production worker never polls the cold start config, even with the staging flag", () => {
		expect(coldStartStoreFor({ AWS_REGION: "us-east-2" })).toBeNull();
		expect(
			coldStartStoreFor({
				STAGING_ENVIRONMENT: "true",
				AWS_REGION: "us-east-2",
			}),
		).toBeNull();
	});

	test("a staging worker polls it", () => {
		expect(
			coldStartStoreFor({
				STAGING_ENVIRONMENT: "true",
				AWS_REGION: "us-east-1",
			}),
		).not.toBeNull();
	});
});
