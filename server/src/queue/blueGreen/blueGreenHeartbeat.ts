import { ms } from "@autumn/shared";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	getAwsTaskIdentity,
	hasAwsTaskIdentity,
} from "@/external/aws/ecs/awsTaskIdentity.js";
import {
	BLUE_GREEN_HEARTBEAT_KEY_PREFIX,
	getAdminS3Config,
} from "@/external/aws/s3/adminS3Config.js";
import { getS3Client } from "@/external/aws/s3/initS3.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { describeSlotGate } from "./blueGreenGate.js";
import {
	getBlueGreenQueueUrls,
	runBlueGreenReadinessChecks,
} from "./blueGreenReadinessChecks.js";
import type { BlueGreenReadinessHeartbeat } from "./blueGreenSchemas.js";
import { getInstanceId } from "./blueGreenSlotEnv.js";
import {
	type BlueGreenServiceName,
	getActiveSlotStoreStatus,
} from "./blueGreenSlotStore.js";

const READINESS_HEARTBEAT_INTERVAL_MS = ms.seconds(20);
const ROLLING_WINDOW_MS = ms.minutes(1);

type ReceiveSample = { at: number; count: number };

const state = {
	startedAt: new Date().toISOString(),
	queueUrls: new Set<string>(),
	lastReceivePollAt: null as string | null,
	lastMessageReceivedAt: null as string | null,
	receiveSamples: [] as ReceiveSample[],
	timers: new Map<BlueGreenServiceName, ReturnType<typeof setInterval>>(),
};

export const recordPollAttempt = ({ queueUrl }: { queueUrl: string }) => {
	state.queueUrls.add(queueUrl);
	state.lastReceivePollAt = new Date().toISOString();
};

export const recordMessagesReceived = ({
	queueUrl,
	count,
}: {
	queueUrl: string;
	count: number;
}) => {
	if (count <= 0) return;
	state.queueUrls.add(queueUrl);
	state.lastMessageReceivedAt = new Date().toISOString();
	state.receiveSamples.push({ at: Date.now(), count });
};

const messagesLastMinute = (): number => {
	const cutoff = Date.now() - ROLLING_WINDOW_MS;
	state.receiveSamples = state.receiveSamples.filter((s) => s.at >= cutoff);
	return state.receiveSamples.reduce((sum, s) => sum + s.count, 0);
};

const readinessHeartbeatS3Key = ({
	serviceName,
}: {
	serviceName: BlueGreenServiceName;
}) => `${BLUE_GREEN_HEARTBEAT_KEY_PREFIX}/${serviceName}.json`;

const buildReadinessHeartbeat = async ({
	db,
	serviceName,
}: {
	db: DrizzleCli;
	serviceName: BlueGreenServiceName;
}): Promise<BlueGreenReadinessHeartbeat | null> => {
	if (!hasAwsTaskIdentity()) return null;

	const identity = getAwsTaskIdentity();
	if (!identity) return null;

	const gate = describeSlotGate({ serviceName });
	if (gate.allowPoll) return null;

	const queueUrls = getBlueGreenQueueUrls({
		knownQueueUrls: Array.from(state.queueUrls),
	});
	const checks = await runBlueGreenReadinessChecks({ db, queueUrls });
	const ok = Object.values(checks).every((check) => check.ok);

	return {
		serviceName,
		instanceId: getInstanceId(),
		pid: process.pid,
		identity,
		declaredActive: false,
		storeHealthy: getActiveSlotStoreStatus({ serviceName }).healthy,
		ok,
		checks,
		...(serviceName === "workers"
			? {
					worker: {
						lastReceivePollAt: state.lastReceivePollAt,
						lastMessageReceivedAt: state.lastMessageReceivedAt,
						messagesLastMinute: messagesLastMinute(),
						queueUrls,
					},
				}
			: {}),
		startedAt: state.startedAt,
		writtenAt: new Date().toISOString(),
	};
};

const writeReadinessHeartbeat = async ({
	db,
	logger,
	serviceName,
}: {
	db: DrizzleCli;
	logger?: Logger;
	serviceName: BlueGreenServiceName;
}) => {
	const heartbeat = await buildReadinessHeartbeat({ db, serviceName });
	if (!heartbeat) return;

	const { bucket, region } = getAdminS3Config();
	if (!bucket) return;

	try {
		await getS3Client({ region }).send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: readinessHeartbeatS3Key({ serviceName }),
				Body: JSON.stringify(heartbeat, null, 2),
				ContentType: "application/json",
			}),
		);
	} catch (error) {
		logger?.warn(
			`Failed to write blue-green heartbeat: ${error instanceof Error ? error.message : error}`,
		);
	}
};

/**
 * Starts periodic inactive-slot readiness writes for this process.
 * No-op when no worker identity has been resolved (local dev without metadata).
 * Active slots do not write this key; it represents the latest green target.
 */
export const startBlueGreenHeartbeat = ({
	db,
	logger,
	serviceName = "workers",
}: {
	db: DrizzleCli;
	logger?: Logger;
	serviceName?: BlueGreenServiceName;
}) => {
	if (state.timers.has(serviceName)) return;
	if (!hasAwsTaskIdentity()) return;

	void writeReadinessHeartbeat({ db, logger, serviceName });
	const timer = setInterval(() => {
		void writeReadinessHeartbeat({ db, logger, serviceName });
	}, READINESS_HEARTBEAT_INTERVAL_MS);
	if (timer.unref) timer.unref();
	state.timers.set(serviceName, timer);
};

export const stopBlueGreenHeartbeat = ({
	serviceName,
}: {
	serviceName?: BlueGreenServiceName;
} = {}) => {
	if (serviceName) {
		const timer = state.timers.get(serviceName);
		if (!timer) return;
		clearInterval(timer);
		state.timers.delete(serviceName);
		return;
	}
	for (const timer of state.timers.values()) {
		clearInterval(timer);
	}
	state.timers.clear();
};
