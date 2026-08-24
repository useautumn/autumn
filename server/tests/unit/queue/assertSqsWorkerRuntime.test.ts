import { describe, expect, test } from "bun:test";

import {
	assertSqsWorkerRuntime,
	productionWorkerQueueNames,
} from "@/queue/assertSqsWorkerRuntime.js";

const prodQueueUrl =
	"https://sqs.us-east-2.amazonaws.com/001092881874/tf-track-async-prod-standard";

describe("SQS worker runtime guard", () => {
	test("identifies prod queues from the env file or queue name", () => {
		expect(
			productionWorkerQueueNames({
				env: {
					ENV_FILE: ".env.prod",
					SQS_QUEUE_URL_V2:
						"https://sqs.us-east-2.amazonaws.com/123/main-queue",
				},
			}),
		).toEqual(["main-queue"]);
		expect(
			productionWorkerQueueNames({
				env: { TRACK_ASYNC_STANDARD_SQS_QUEUE_URL: prodQueueUrl },
			}),
		).toEqual(["tf-track-async-prod-standard"]);
	});

	test("allows ECS and non-prod local workers", async () => {
		await expect(
			assertSqsWorkerRuntime({ env: { ENV_FILE: ".env.prod" }, isEcs: true }),
		).resolves.toBeUndefined();
		await expect(
			assertSqsWorkerRuntime({
				env: {
					SQS_QUEUE_URL_V2:
						"https://sqs.us-east-2.amazonaws.com/123/autumn-dev-standard",
				},
				isEcs: false,
			}),
		).resolves.toBeUndefined();
	});

	test("records and blocks a local prod worker before polling", async () => {
		const events: Array<{ message: string; fields: Record<string, unknown> }> =
			[];
		let flushed = false;
		const workerLogger = {
			debug() {},
			info() {},
			warn() {},
			error(message: string, fields: Record<string, unknown>) {
				events.push({ message, fields });
			},
			child() {
				return this;
			},
		};

		await expect(
			assertSqsWorkerRuntime({
				env: { TRACK_ASYNC_STANDARD_SQS_QUEUE_URL: prodQueueUrl },
				isEcs: false,
				workerLogger,
				flush: async () => {
					flushed = true;
				},
			}),
		).rejects.toThrow("Refusing to start a production SQS worker outside ECS");

		expect(flushed).toBe(true);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			message: "Blocked production SQS worker outside ECS",
			fields: {
				type: "prod_sqs_worker_outside_ecs",
				queues: ["tf-track-async-prod-standard"],
				pid: expect.any(Number),
				cwd: expect.any(String),
				command: expect.any(String),
			},
		});
	});
});
