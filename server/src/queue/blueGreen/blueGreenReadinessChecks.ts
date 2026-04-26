import { GetQueueAttributesCommand, type SQSClient } from "@aws-sdk/client-sqs";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { redis } from "@/external/redis/initRedis.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import { withTimeout } from "@/utils/withTimeout.js";
import { getSqsClient, QUEUE_URL } from "../initSqs.js";
import type { BlueGreenProbeResult } from "./blueGreenSchemas.js";

const CHECK_TIMEOUT_MS = 5_000;

const elapsedMs = ({ startedAt }: { startedAt: number }) =>
	Math.max(0, Date.now() - startedAt);

const asErrorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const probe = async ({
	fn,
}: {
	fn: () => Promise<void>;
}): Promise<BlueGreenProbeResult> => {
	const startedAt = Date.now();
	try {
		await withTimeout({
			timeoutMs: CHECK_TIMEOUT_MS,
			fn,
			timeoutMessage: "timed out",
		});
		return { ok: true, latencyMs: elapsedMs({ startedAt }) };
	} catch (error) {
		return {
			ok: false,
			latencyMs: elapsedMs({ startedAt }),
			error: asErrorMessage(error),
		};
	}
};

const getConfiguredQueueUrls = () =>
	[
		QUEUE_URL,
		process.env.TRACK_SQS_QUEUE_URL,
		process.env.SQS_QUEUE_URL,
	].filter((url): url is string => Boolean(url));

export const getBlueGreenQueueUrls = ({
	knownQueueUrls = [],
}: {
	knownQueueUrls?: string[];
} = {}) =>
	Array.from(new Set([...getConfiguredQueueUrls(), ...knownQueueUrls]));

export const runBlueGreenReadinessChecks = async ({
	db,
	sqs = getSqsClient(),
	queueUrls = getBlueGreenQueueUrls(),
}: {
	db: DrizzleCli;
	sqs?: SQSClient;
	queueUrls?: string[];
}) => {
	const [dbCheck, redisCheck, redisV2Check, sqsCheck] = await Promise.all([
		probe({
			fn: async () => {
				await db.execute("select 1");
			},
		}),
		probe({
			fn: async () => {
				await redis.ping();
			},
		}),
		probe({
			fn: async () => {
				await resolveRedisV2().ping();
			},
		}),
		probe({
			fn: async () => {
				if (queueUrls.length === 0) {
					throw new Error("no SQS queue URLs configured");
				}
				await Promise.all(
					queueUrls.map((queueUrl) =>
						sqs.send(
							new GetQueueAttributesCommand({
								QueueUrl: queueUrl,
								AttributeNames: ["ApproximateNumberOfMessages"],
							}),
						),
					),
				);
			},
		}),
	]);

	return {
		db: dbCheck,
		redis: redisCheck,
		redisV2: redisV2Check,
		sqs: sqsCheck,
	};
};
