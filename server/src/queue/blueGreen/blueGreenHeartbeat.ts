import { ms } from "@autumn/shared";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
	BLUE_GREEN_HEARTBEAT_KEY_PREFIX,
	getAdminS3Config,
} from "@/external/aws/s3/adminS3Config.js";
import { getS3Client } from "@/external/aws/s3/initS3.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { describeSlotGate } from "./blueGreenGate.js";
import type { WorkerHeartbeat } from "./blueGreenSchemas.js";
import {
	getInstanceId,
	getResolvedWorkerIdentity,
	hasWorkerIdentity,
} from "./blueGreenSlotEnv.js";
import { getActiveSlotStoreStatus } from "./blueGreenSlotStore.js";

const HEARTBEAT_INTERVAL_MS = ms.seconds(10);
const ROLLING_WINDOW_MS = ms.minutes(1);

type ReceiveSample = { at: number; count: number };

const state = {
	startedAt: new Date().toISOString(),
	queueUrls: new Set<string>(),
	lastReceivePollAt: null as string | null,
	lastMessageReceivedAt: null as string | null,
	receiveSamples: [] as ReceiveSample[],
	timer: null as ReturnType<typeof setInterval> | null,
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

const buildHeartbeat = (): WorkerHeartbeat | null => {
	if (!hasWorkerIdentity()) return null;

	const identity = getResolvedWorkerIdentity();
	if (!identity) return null;

	const gate = describeSlotGate();

	return {
		instanceId: getInstanceId(),
		pid: process.pid,
		identity,
		declaredActive: gate.allowPoll && gate.reason === "active",
		storeHealthy: getActiveSlotStoreStatus().healthy,
		lastReceivePollAt: state.lastReceivePollAt,
		lastMessageReceivedAt: state.lastMessageReceivedAt,
		messagesLastMinute: messagesLastMinute(),
		queueUrls: Array.from(state.queueUrls),
		startedAt: state.startedAt,
		writtenAt: new Date().toISOString(),
	};
};

const heartbeatS3Key = () =>
	`${BLUE_GREEN_HEARTBEAT_KEY_PREFIX}/${getInstanceId()}.json`;

const writeHeartbeat = async ({ logger }: { logger?: Logger }) => {
	const heartbeat = buildHeartbeat();
	if (!heartbeat) return;

	const { bucket, region } = getAdminS3Config();
	if (!bucket) return;

	try {
		await getS3Client({ region }).send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: heartbeatS3Key(),
				Body: JSON.stringify(heartbeat),
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
 * Starts periodic heartbeat writes for this process.
 * No-op when no worker identity has been resolved (local dev without metadata).
 */
export const startBlueGreenHeartbeat = ({
	logger,
}: {
	logger?: Logger;
} = {}) => {
	if (state.timer) return;
	if (!hasWorkerIdentity()) return;

	void writeHeartbeat({ logger });
	state.timer = setInterval(() => {
		void writeHeartbeat({ logger });
	}, HEARTBEAT_INTERVAL_MS);
	if (state.timer.unref) state.timer.unref();
};

export const stopBlueGreenHeartbeat = () => {
	if (state.timer) {
		clearInterval(state.timer);
		state.timer = null;
	}
};
