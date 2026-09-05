import { describe, expect, test } from "bun:test";
import {
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { createS3CheckpointObjectClient } from "../../../src/s3/s3CheckpointObjectClient.js";

const notFound = ({
	name,
}: {
	name: "NoSuchBucket" | "NoSuchKey" | "NotFound";
}) =>
	Object.assign(new Error("not found"), {
		name,
		$metadata: { httpStatusCode: 404 },
	});

describe("S3 checkpoint object client", () => {
	test("maps conditional puts to S3 request preconditions", async () => {
		const commands: PutObjectCommand[] = [];
		const client = {
			send: async (command: unknown) => {
				if (!(command instanceof PutObjectCommand)) {
					throw new Error("Unexpected command");
				}
				commands.push(command);
				return { ETag: '"etag-1"' };
			},
		} as unknown as S3Client;
		const objectClient = createS3CheckpointObjectClient({ client });
		const signal = new AbortController().signal;

		await objectClient.put({
			bucket: "bucket",
			key: "key",
			body: new Uint8Array([1]),
			contentEncoding: "gzip",
			contentType: "application/json",
			metadata: { "next-offset": "42" },
			condition: { kind: "absent" },
			signal,
		});
		await objectClient.put({
			bucket: "bucket",
			key: "key",
			body: new Uint8Array([2]),
			contentEncoding: "gzip",
			contentType: "application/json",
			metadata: { "next-offset": "43" },
			condition: { kind: "etag", etag: '"etag-1"' },
			signal,
		});

		expect(commands[0]?.input.IfNoneMatch).toBe("*");
		expect(commands[0]?.input.IfMatch).toBeUndefined();
		expect(commands[1]?.input.IfNoneMatch).toBeUndefined();
		expect(commands[1]?.input.IfMatch).toBe('"etag-1"');
	});

	test("maps missing HEAD and GET objects to null", async () => {
		const client = {
			send: async (command: unknown) => {
				if (command instanceof HeadObjectCommand) {
					throw notFound({ name: "NotFound" });
				}
				if (command instanceof GetObjectCommand) {
					throw notFound({ name: "NoSuchKey" });
				}
				throw new Error("Unexpected command");
			},
		} as unknown as S3Client;
		const objectClient = createS3CheckpointObjectClient({ client });
		const params = {
			bucket: "bucket",
			key: "key",
			signal: new AbortController().signal,
		};

		await expect(objectClient.head(params)).resolves.toBeNull();
		await expect(objectClient.get(params)).resolves.toBeNull();
	});

	test("does not hide a missing bucket as an absent checkpoint", async () => {
		const missingBucket = notFound({ name: "NoSuchBucket" });
		const client = {
			send: async () => {
				throw missingBucket;
			},
		} as unknown as S3Client;
		const objectClient = createS3CheckpointObjectClient({ client });

		await expect(
			objectClient.get({
				bucket: "missing-bucket",
				key: "checkpoint",
				signal: new AbortController().signal,
			}),
		).rejects.toBe(missingBucket);
	});
});
