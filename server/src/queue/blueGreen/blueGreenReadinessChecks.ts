import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	DEFAULT_AWS_REGION,
	extractRegionFromQueueUrl,
} from "@/external/aws/awsRegionUtils.js";
import { redis } from "@/external/redis/initRedis.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import { withTimeout } from "@/utils/withTimeout.js";
import { QUEUE_URL } from "../initSqs.js";
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
	[QUEUE_URL, process.env.TRACK_SQS_QUEUE_URL].filter(
		(url): url is string => Boolean(url),
	);

export const getBlueGreenQueueUrls = ({
	knownQueueUrls = [],
}: {
	knownQueueUrls?: string[];
} = {}) =>
	Array.from(new Set([...getConfiguredQueueUrls(), ...knownQueueUrls]));

// Build a per-queue-URL SQSClient using the region extracted from the URL,
// so SigV4 signs against the queue's region. Reusing one singleton across
// queues in different regions fails with "Credential should be scoped to a
// valid region" because the client's region disagrees with the endpoint
// the SDK falls back to (the queue URL's host).
const sqsClientsByRegion = new Map<string, SQSClient>();
const getSqsClientForQueue = (queueUrl: string): SQSClient => {
	const region =
		extractRegionFromQueueUrl({ queueUrl }) ?? DEFAULT_AWS_REGION;
	const cached = sqsClientsByRegion.get(region);
	if (cached) return cached;
	const client = new SQSClient({ region });
	sqsClientsByRegion.set(region, client);
	return client;
};

export const runBlueGreenReadinessChecks = async ({
	db,
	queueUrls = getBlueGreenQueueUrls(),
}: {
	db: DrizzleCli;
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
						getSqsClientForQueue(queueUrl).send(
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
