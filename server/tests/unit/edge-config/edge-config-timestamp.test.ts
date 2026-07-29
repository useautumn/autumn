import { describe, expect, jest, test } from "bun:test";
import type { S3Client } from "@aws-sdk/client-s3";
import { ADMIN_EDGE_CONFIG_TIMESTAMP_KEY } from "@/external/aws/s3/adminS3Config.js";
import {
	readEdgeConfigTimestamp,
	writeEdgeConfigTimestamp,
} from "@/internal/misc/edgeConfig/edgeConfigTimestamp.js";

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
});
