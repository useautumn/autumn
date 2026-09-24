import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
	ADMIN_EDGE_CONFIG_TIMESTAMP_KEY,
	getAdminS3Config,
} from "@/external/aws/s3/adminS3Config.js";
import {
	createBunS3EdgeConfigClient,
	type EdgeConfigS3Client,
} from "@/external/aws/s3/bunS3EdgeConfigClient.js";
import { getS3BodyAsString } from "@/external/aws/s3/s3Utils.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";

export const EDGE_CONFIG_VERSION_REDIS_KEY = "edge-config:version";
const REDIS_MARKER_TIMEOUT_MS = 1_000;

export type EdgeConfigVersionRedis = {
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string) => Promise<unknown>;
};

// Imported lazily: miscRedisInstances imports an edge config store, so a static
// import here would close a cycle through edgeConfigStore.
const getMiscMainRedisClient = async (): Promise<EdgeConfigVersionRedis> => {
	const { getMiscMainRedis } = await import(
		"@/external/redis/miscCache/miscRedisInstances.js"
	);
	return getMiscMainRedis();
};

// The misc client queues commands while disconnected (up to its 10s command
// timeout); a poll tick must see that as a failure, not stall on it.
const withTimeout = <T>({
	promise,
	timeoutMs,
}: {
	promise: Promise<T>;
	timeoutMs: number;
}) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`Redis marker timed out after ${timeoutMs}ms`)),
			timeoutMs,
		);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/** Null means no marker was ever written: "no signal", not an error. */
export const readEdgeConfigVersionFromRedis = async ({
	getRedis = getMiscMainRedisClient,
	timeoutMs = REDIS_MARKER_TIMEOUT_MS,
}: {
	getRedis?: () => Promise<EdgeConfigVersionRedis>;
	timeoutMs?: number;
} = {}): Promise<string | null> =>
	await withTimeout({
		promise: getRedis().then((redis) =>
			redis.get(EDGE_CONFIG_VERSION_REDIS_KEY),
		),
		timeoutMs,
	});

const getClient = (s3Client?: EdgeConfigS3Client) => {
	if (s3Client) return s3Client;
	const { region } = getAdminS3Config();
	return createBunS3EdgeConfigClient({ region });
};

export const readEdgeConfigTimestamp = async ({
	s3Client,
}: {
	s3Client?: EdgeConfigS3Client;
} = {}): Promise<string | null> => {
	const { bucket } = getAdminS3Config();

	try {
		const response = await getClient(s3Client).send(
			new GetObjectCommand({
				Bucket: bucket,
				Key: ADMIN_EDGE_CONFIG_TIMESTAMP_KEY,
			}),
		);
		if (!response.Body) return null;

		const raw = await getS3BodyAsString({ body: response.Body });
		const { updatedAt, changeId } = JSON.parse(raw) as {
			updatedAt?: unknown;
			changeId?: unknown;
		};
		if (typeof updatedAt !== "string") {
			throw new Error("Edge config timestamp is invalid");
		}
		return typeof changeId === "string"
			? `${updatedAt}:${changeId}`
			: updatedAt;
	} catch (error) {
		if (error instanceof Error && error.name === "NoSuchKey") return null;
		throw error;
	}
};

const WRITE_ATTEMPTS = 3;
const WRITE_RETRY_DELAY_MS = 50;

/** Retries because the config object is already written by the time this runs:
 *  a lost timestamp leaves that config in S3 with nothing signalling it. */
export const writeEdgeConfigTimestamp = async ({
	s3Client,
	getRedis = getMiscMainRedisClient,
	logger,
}: {
	s3Client?: EdgeConfigS3Client;
	getRedis?: () => Promise<EdgeConfigVersionRedis>;
	logger?: Logger;
} = {}): Promise<string> => {
	const { bucket } = getAdminS3Config();
	const client = getClient(s3Client);

	let lastError: unknown;
	for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
		// Fresh marker per attempt: a retry reusing the first marker can overwrite a
		// concurrent writer's signal with a value pollers already observed.
		const updatedAt = new Date().toISOString();
		const changeId = randomUUID();
		try {
			await client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: ADMIN_EDGE_CONFIG_TIMESTAMP_KEY,
					Body: JSON.stringify({ updatedAt, changeId }),
					ContentType: "application/json",
				}),
			);
		} catch (error) {
			lastError = error;
			if (attempt < WRITE_ATTEMPTS) {
				await new Promise((resolve) =>
					setTimeout(resolve, WRITE_RETRY_DELAY_MS * attempt),
				);
			}
			continue;
		}

		const marker = `${updatedAt}:${changeId}`;
		await bumpRedisMarker({ marker, getRedis, logger });
		return marker;
	}

	throw lastError;
};

/** Best effort: S3 already holds the signal, and pollers re-read it within 60s. */
const bumpRedisMarker = async ({
	marker,
	getRedis,
	logger,
}: {
	marker: string;
	getRedis: () => Promise<EdgeConfigVersionRedis>;
	logger?: Logger;
}) => {
	try {
		await withTimeout({
			promise: getRedis().then((redis) =>
				redis.set(EDGE_CONFIG_VERSION_REDIS_KEY, marker),
			),
			timeoutMs: REDIS_MARKER_TIMEOUT_MS,
		});
	} catch (error) {
		const warn = logger?.warn ?? console.warn;
		warn(
			`Edge config Redis marker bump failed; S3 timestamp still signals: ${error}`,
		);
	}
};
