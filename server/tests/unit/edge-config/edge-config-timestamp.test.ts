import { describe, expect, jest, test } from "bun:test";
import type { S3Client } from "@aws-sdk/client-s3";
import { ADMIN_EDGE_CONFIG_TIMESTAMP_KEY } from "@/external/aws/s3/adminS3Config.js";
import {
	readEdgeConfigTimestamp,
	writeEdgeConfigTimestamp,
} from "@/internal/misc/edgeConfigs/edgeConfigTimestamp.js";

const makeBody = (data: unknown) => ({
	Body: {
		transformToString: async () => JSON.stringify(data),
	},
});

describe("edge config timestamp", () => {
	test("reads the timestamp and unique change ID", async () => {
		const s3Client = {
			send: jest.fn(async () =>
				makeBody({ updatedAt: "2026-01-01T00:00:00.000Z", changeId: "abc" }),
			),
		} as unknown as S3Client;

		expect(await readEdgeConfigTimestamp({ s3Client })).toBe(
			"2026-01-01T00:00:00.000Z:abc",
		);
	});

	test("treats a missing timestamp as uninitialized", async () => {
		const error = new Error("missing");
		error.name = "NoSuchKey";
		const s3Client = {
			send: jest.fn(async () => {
				throw error;
			}),
		} as unknown as S3Client;

		expect(await readEdgeConfigTimestamp({ s3Client })).toBeNull();
	});

	test("writes the shared timestamp object", async () => {
		const send = jest.fn(async (_command: unknown) => ({}));
		const s3Client = { send } as unknown as S3Client;

		const timestamp = await writeEdgeConfigTimestamp({ s3Client });
		const command = send.mock.calls[0]![0] as {
			input: { Key: string; Body: string };
		};
		const body = JSON.parse(command.input.Body);

		expect(command.input.Key).toBe(ADMIN_EDGE_CONFIG_TIMESTAMP_KEY);
		expect(timestamp).toBe(`${body.updatedAt}:${body.changeId}`);
	});

	// A config PUT that lands while the timestamp PUT fails leaves the new config
	// in S3 with nothing signalling it, so every process keeps serving the old one.
	test("retries a transient timestamp write failure", async () => {
		let attempts = 0;
		const send = jest.fn(async (_command: unknown) => {
			attempts++;
			if (attempts < 3) throw new Error("InternalError");
			return {};
		});
		const s3Client = { send } as unknown as S3Client;

		const timestamp = await writeEdgeConfigTimestamp({ s3Client });

		expect(attempts).toBe(3);
		expect(timestamp).toContain(":");
	});

	// A retry that reuses the first attempt's marker can overwrite a concurrent
	// writer's signal with a value pollers have already observed and skipped.
	test("uses a distinct marker on each retry attempt", async () => {
		const bodies: string[] = [];
		let attempts = 0;
		const send = jest.fn(async (command: unknown) => {
			attempts++;
			const input = (command as { input: { Body: string } }).input;
			bodies.push(input.Body);
			if (attempts < 2) throw new Error("InternalError");
			return {};
		});
		const s3Client = { send } as unknown as S3Client;

		const timestamp = await writeEdgeConfigTimestamp({ s3Client });
		const changeIds = bodies.map((b) => JSON.parse(b).changeId);

		expect(new Set(changeIds).size).toBe(2);
		expect(timestamp).toContain(changeIds[1]);
	});

	test("surfaces the error once retries are exhausted", async () => {
		const send = jest.fn(async (_command: unknown) => {
			throw new Error("AccessDenied");
		});
		const s3Client = { send } as unknown as S3Client;

		await expect(writeEdgeConfigTimestamp({ s3Client })).rejects.toThrow(
			"AccessDenied",
		);
	});
});
