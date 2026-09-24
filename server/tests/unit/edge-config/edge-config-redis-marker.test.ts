/**
 * The admin write path bumps a Redis marker next to the S3 timestamp so every
 * poller sees a change within one 2s tick instead of one S3 poll.
 *
 * Contract:
 *   - writeEdgeConfigTimestamp SETs `edge-config:version` to the exact marker
 *     it wrote to S3 (`${updatedAt}:${changeId}`), after the S3 write.
 *   - A Redis failure (client unavailable or SET rejecting) never fails the
 *     write: the S3 timestamp still lands and the marker is returned.
 *   - readEdgeConfigVersionFromRedis returns the stored marker, or null when
 *     the key is missing, and rejects when Redis hangs past its timeout (the
 *     registry then treats Redis as failing).
 */

import { describe, expect, jest, test } from "bun:test";
import type { S3Client } from "@aws-sdk/client-s3";
import {
	EDGE_CONFIG_VERSION_REDIS_KEY,
	readEdgeConfigVersionFromRedis,
	writeEdgeConfigTimestamp,
} from "@/internal/misc/edgeConfig/edgeConfigTimestamp.js";
import { createFakeLogger } from "./utils/fakeLogger.js";

const createFakeRedis = () => {
	const values = new Map<string, string>();
	return {
		values,
		get: jest.fn(async (key: string) => values.get(key) ?? null),
		set: jest.fn(async (key: string, value: string) => {
			values.set(key, value);
			return "OK";
		}),
	};
};

const createRecordingS3 = () => {
	const bodies: string[] = [];
	const send = jest.fn(async (command: unknown) => {
		bodies.push((command as { input: { Body: string } }).input.Body);
		return {};
	});
	return { bodies, s3Client: { send } as unknown as S3Client };
};

describe("edge config Redis marker", () => {
	test("bumps Redis with the same marker it wrote to S3", async () => {
		const redis = createFakeRedis();
		const { bodies, s3Client } = createRecordingS3();

		const marker = await writeEdgeConfigTimestamp({
			s3Client,
			getRedis: async () => redis,
		});

		const { updatedAt, changeId } = JSON.parse(bodies[0]!);
		expect(marker).toBe(`${updatedAt}:${changeId}`);
		expect(redis.set).toHaveBeenCalledTimes(1);
		expect(redis.values.get(EDGE_CONFIG_VERSION_REDIS_KEY)).toBe(marker);
	});

	test("a Redis failure never fails the write and S3 still lands", async () => {
		const logger = createFakeLogger();

		// client unavailable (env missing / connect failure)
		const unavailable = createRecordingS3();
		const markerA = await writeEdgeConfigTimestamp({
			s3Client: unavailable.s3Client,
			getRedis: async () => {
				throw new Error("misc cache is required");
			},
			logger,
		});
		expect(unavailable.bodies).toHaveLength(1);
		expect(markerA).toContain(":");

		// SET rejects
		const rejecting = createRecordingS3();
		const markerB = await writeEdgeConfigTimestamp({
			s3Client: rejecting.s3Client,
			getRedis: async () => ({
				get: async () => null,
				set: async () => {
					throw new Error("READONLY");
				},
			}),
			logger,
		});
		expect(rejecting.bodies).toHaveLength(1);
		expect(markerB).toContain(":");
		expect(logger.warn).toHaveBeenCalledTimes(2);
	});

	test("reads the marker back, or null when the key is missing", async () => {
		const redis = createFakeRedis();
		const getRedis = async () => redis;

		expect(await readEdgeConfigVersionFromRedis({ getRedis })).toBeNull();

		redis.values.set(EDGE_CONFIG_VERSION_REDIS_KEY, "2026-01-01:abc");
		expect(await readEdgeConfigVersionFromRedis({ getRedis })).toBe(
			"2026-01-01:abc",
		);

		// a hung Redis counts as failing instead of stalling the poll tick
		const hung = readEdgeConfigVersionFromRedis({
			getRedis: async () => ({
				get: () => new Promise<string | null>(() => {}),
				set: async () => "OK",
			}),
			timeoutMs: 20,
		});
		await expect(hung).rejects.toThrow("timed out");
	});
});
