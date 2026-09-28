import { describe, expect, test } from "bun:test";
import { createSqsEnv } from "@autumn/env/sqs";
import { createConsoleLogger } from "@autumn/logging";
import { AppEnv } from "@autumn/shared";
import { createSqsJobs, jobsOnQueue } from "../../src/createSqsJobs.js";
import { autoTopupJob } from "../../src/jobs/autoTopup.js";

const logger = createConsoleLogger({ level: "error" });
const payload = {
	orgId: "org_1",
	env: AppEnv.Sandbox,
	customerId: "cus_1",
	featureId: "credits",
};

describe("createSqsJobs", () => {
	test("a job routes to its queue, and an unconfigured queue fails at send time, not at creation", async () => {
		const sqsJobs = createSqsJobs({
			ctx: { logger },
			config: { env: createSqsEnv({}) },
		});
		expect(await sqsJobs.autoTopup.trySend(payload)).toMatchObject({
			sent: false,
		});
		await expect(sqsJobs.autoTopup.send(payload)).rejects.toThrow(
			/queue "general" is not configured/,
		);
	});

	test("the job queue's union is every job routed to it", () => {
		expect(jobsOnQueue({ name: "general" })).toEqual([autoTopupJob]);
		expect(jobsOnQueue({ name: "track" })).toEqual([]);
	});

	test("env maps the infra variables once, with fallbacks decided in the routing table", () => {
		const env = createSqsEnv({
			SQS_QUEUE_URL_V2: "https://sqs.us-east-2.amazonaws.com/1/autumn.fifo",
			TRACK_ASYNC_SQS_QUEUE_URL:
				"https://sqs.us-east-2.amazonaws.com/1/legacy.fifo",
			AWS_ACCESS_KEY_ID: "k",
		});
		expect(env.SQS_GENERAL_QUEUE_URL).toContain("autumn.fifo");
		expect(env.SQS_CREDENTIALS).toBeUndefined();
		expect(env.SQS_ASYNC_TRACK_STANDARD_QUEUE_URL).toBeNull();
	});
});
