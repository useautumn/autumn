/**
 * TDD contract for routing async Track and UpdateBalance jobs.
 *
 * Contract under test:
 *   - Producers prefer TRACK_ASYNC_STANDARD_SQS_QUEUE_URL.
 *   - Producers fall back to TRACK_ASYNC_SQS_QUEUE_URL during rollout.
 *   - UpdateBalance prefers its explicit queue URL and falls back to the legacy
 *     TRACK_ASYNC_SQS_QUEUE_URL.
 *   - Workers consume all configured URLs without duplicate pollers.
 *   - Standard-queue sends omit FIFO-only message identifiers.
 *
 * Pre-implementation red: the queue URL resolver does not exist and producers
 * ignore TRACK_ASYNC_STANDARD_SQS_QUEUE_URL.
 * Post-implementation green: producer and worker routing support the migration.
 */

import { afterEach, expect, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runAsyncTrack } from "@/internal/balances/track/runAsyncTrack.js";
import { getBlueGreenQueueUrls } from "@/queue/blueGreen/blueGreenReadinessChecks.js";
import { getSqsClient } from "@/queue/initSqs.js";
import {
	getAsyncTrackProducerQueueUrl,
	getAsyncTrackWorkerQueueUrls,
	getTrackAndUpdateBalanceWorkerQueueUrls,
	getUpdateBalanceProducerQueueUrl,
} from "@/queue/trackAsyncQueueUrls.js";

const STANDARD_QUEUE_URL =
	"https://sqs.us-east-2.amazonaws.com/123456789012/track-async-standard";
const LEGACY_FIFO_QUEUE_URL =
	"https://sqs.us-east-2.amazonaws.com/123456789012/track-async.fifo";
const UPDATE_BALANCE_QUEUE_URL =
	"https://sqs.us-east-2.amazonaws.com/123456789012/update-balance.fifo";

const originalStandardQueueUrl = process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
const originalLegacyQueueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL;
const originalUpdateBalanceQueueUrl = process.env.UPDATE_BALANCE_SQS_QUEUE_URL;

const restoreEnv = ({ key, value }: { key: string; value?: string }) => {
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
};

afterEach(() => {
	restoreEnv({
		key: "TRACK_ASYNC_STANDARD_SQS_QUEUE_URL",
		value: originalStandardQueueUrl,
	});
	restoreEnv({
		key: "TRACK_ASYNC_SQS_QUEUE_URL",
		value: originalLegacyQueueUrl,
	});
	restoreEnv({
		key: "UPDATE_BALANCE_SQS_QUEUE_URL",
		value: originalUpdateBalanceQueueUrl,
	});
});

test("prefers Standard for producers while workers consume Standard and FIFO", () => {
	process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = STANDARD_QUEUE_URL;
	process.env.TRACK_ASYNC_SQS_QUEUE_URL = LEGACY_FIFO_QUEUE_URL;

	expect(getAsyncTrackProducerQueueUrl()).toBe(STANDARD_QUEUE_URL);
	expect(getAsyncTrackWorkerQueueUrls()).toEqual([
		STANDARD_QUEUE_URL,
		LEGACY_FIFO_QUEUE_URL,
	]);
	expect(getBlueGreenQueueUrls()).toEqual(
		expect.arrayContaining([STANDARD_QUEUE_URL, LEGACY_FIFO_QUEUE_URL]),
	);
});

test("falls back to the legacy FIFO and avoids duplicate worker pollers", () => {
	delete process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
	process.env.TRACK_ASYNC_SQS_QUEUE_URL = LEGACY_FIFO_QUEUE_URL;

	expect(getAsyncTrackProducerQueueUrl()).toBe(LEGACY_FIFO_QUEUE_URL);
	expect(getAsyncTrackWorkerQueueUrls()).toEqual([LEGACY_FIFO_QUEUE_URL]);

	process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = LEGACY_FIFO_QUEUE_URL;
	expect(getAsyncTrackWorkerQueueUrls()).toEqual([LEGACY_FIFO_QUEUE_URL]);

	process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = "";
	expect(getAsyncTrackProducerQueueUrl()).toBe(LEGACY_FIFO_QUEUE_URL);
});

test("routes UpdateBalance through its explicit queue with a legacy fallback", () => {
	process.env.UPDATE_BALANCE_SQS_QUEUE_URL = UPDATE_BALANCE_QUEUE_URL;
	process.env.TRACK_ASYNC_SQS_QUEUE_URL = LEGACY_FIFO_QUEUE_URL;

	expect(getUpdateBalanceProducerQueueUrl()).toBe(UPDATE_BALANCE_QUEUE_URL);

	delete process.env.UPDATE_BALANCE_SQS_QUEUE_URL;
	expect(getUpdateBalanceProducerQueueUrl()).toBe(LEGACY_FIFO_QUEUE_URL);

	process.env.UPDATE_BALANCE_SQS_QUEUE_URL = "";
	expect(getUpdateBalanceProducerQueueUrl()).toBe(LEGACY_FIFO_QUEUE_URL);
});

test("workers and readiness include each Track and UpdateBalance queue once", () => {
	process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = STANDARD_QUEUE_URL;
	process.env.UPDATE_BALANCE_SQS_QUEUE_URL = UPDATE_BALANCE_QUEUE_URL;
	process.env.TRACK_ASYNC_SQS_QUEUE_URL = LEGACY_FIFO_QUEUE_URL;

	expect(getTrackAndUpdateBalanceWorkerQueueUrls()).toEqual([
		STANDARD_QUEUE_URL,
		UPDATE_BALANCE_QUEUE_URL,
		LEGACY_FIFO_QUEUE_URL,
	]);
	for (const queueUrl of [
		STANDARD_QUEUE_URL,
		UPDATE_BALANCE_QUEUE_URL,
		LEGACY_FIFO_QUEUE_URL,
	]) {
		expect(
			getBlueGreenQueueUrls().filter(
				(configuredQueueUrl) => configuredQueueUrl === queueUrl,
			),
		).toHaveLength(1);
	}

	process.env.UPDATE_BALANCE_SQS_QUEUE_URL = LEGACY_FIFO_QUEUE_URL;
	expect(getTrackAndUpdateBalanceWorkerQueueUrls()).toEqual([
		STANDARD_QUEUE_URL,
		LEGACY_FIFO_QUEUE_URL,
	]);
});

test("sends async Track to Standard without FIFO-only identifiers", async () => {
	process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = STANDARD_QUEUE_URL;
	process.env.TRACK_ASYNC_SQS_QUEUE_URL = LEGACY_FIFO_QUEUE_URL;

	const sqsClient = getSqsClient({ queueUrl: STANDARD_QUEUE_URL });
	const originalSend = sqsClient.send.bind(sqsClient);
	const commands: Array<{ input: Record<string, unknown> }> = [];
	sqsClient.send = (async (command: {
		input: { Entries?: Array<{ Id: string }> };
	}) => {
		commands.push(command);
		return {
			Successful: command.input.Entries?.map(({ Id }) => ({ Id })) ?? [],
		};
	}) as typeof sqsClient.send;

	const ctx = {
		id: "req_standard_1",
		org: { id: "org_123" },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		extraLogs: {},
		logger: { warn: () => undefined, error: () => undefined },
	} as unknown as AutumnContext;

	try {
		await runAsyncTrack({
			ctx,
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
				value: 1,
				async: true,
			},
		});

		expect(commands).toHaveLength(1);
		expect(commands[0].input.QueueUrl).toBe(STANDARD_QUEUE_URL);
		const entries = commands[0].input.Entries as Array<Record<string, unknown>>;
		expect(entries).toHaveLength(1);
		expect(entries[0]).not.toHaveProperty("MessageGroupId");
		expect(entries[0]).not.toHaveProperty("MessageDeduplicationId");
		expect(JSON.parse(entries[0].MessageBody as string)).toMatchObject({
			name: "track",
			data: { requestId: "req_standard_1" },
		});
	} finally {
		sqsClient.send = originalSend as SQSClient["send"];
	}
});
