import { describe, expect, mock, test } from "bun:test";
import type { Message } from "@aws-sdk/client-sqs";
import {
	JobTimeoutError,
	reportJobTimeout,
} from "@/queue/retryBudget/reportJobTimeout.js";

const createLogger = () => {
	const logger = {
		child: mock(() => logger),
		error: mock(() => {}),
		warn: mock(() => {}),
	};
	return logger;
};

const job = {
	name: "track",
	data: { orgId: "org_1", env: "live", customerId: "cus_1" },
};

const messageOnDelivery = (receiveCount: number): Message => ({
	MessageId: "msg_1",
	Attributes: { ApproximateReceiveCount: String(receiveCount) },
});

const report = ({ receiveCount }: { receiveCount: number }) => {
	const logger = createLogger();
	reportJobTimeout({
		job,
		message: messageOnDelivery(receiveCount),
		timeoutMs: 25_000,
		retryBudget: { kind: "bounded", maxReceiveCount: 5 },
		logger: logger as never,
	});
	return logger;
};

describe("reportJobTimeout", () => {
	test("each job's timeout is its own Sentry issue", () => {
		expect(
			new JobTimeoutError({ jobName: "track", timeoutMs: 1 }).fingerprint,
		).toEqual(["job-timeout", "track"]);
	});

	test("warns while SQS will redeliver", () => {
		const logger = report({ receiveCount: 2 });

		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.error).not.toHaveBeenCalled();
	});

	test("reports an error with the job's org context on the last delivery", () => {
		const logger = report({ receiveCount: 5 });

		expect(logger.error).toHaveBeenCalledWith("track timed out on delivery 5", {
			error: expect.any(JobTimeoutError),
			context: { org_id: "org_1", env: "live", customer_id: "cus_1" },
		});
	});
});
