import { describe, expect, test } from "bun:test";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import { createAdminBucketObjects } from "../../../../src/external/s3/createAdminBucketObjects.js";

function s3Error({ name, status }: { name: string; status: number }): Error {
	return Object.assign(new Error(name), {
		name,
		$metadata: { httpStatusCode: status },
	});
}

function fakeClient(answer: (command: unknown) => unknown) {
	const sent: { command: unknown; signal: AbortSignal | undefined }[] = [];
	const client = {
		send: async (
			command: unknown,
			options?: { abortSignal?: AbortSignal },
		): Promise<unknown> => {
			sent.push({ command, signal: options?.abortSignal });
			const answered = answer(command);
			if (answered instanceof Error) throw answered;
			return answered;
		},
	};
	return { client, sent };
}

function objectsOf(client: ReturnType<typeof fakeClient>["client"]) {
	return createAdminBucketObjects({
		ctx: { client },
		config: { bucket: "admin-bucket", timeoutMs: 2_000 },
	});
}

describe("admin bucket objects", () => {
	test("create writes only when nothing is there, and a taken key answers false", async () => {
		const { client, sent } = fakeClient((command) =>
			command instanceof PutObjectCommand && command.input.Key === "taken.json"
				? s3Error({ name: "PreconditionFailed", status: 412 })
				: {},
		);
		const objects = objectsOf(client);
		expect(await objects.create({ key: "free.json", body: "{}" })).toBe(true);
		expect(await objects.create({ key: "taken.json", body: "{}" })).toBe(false);
		const put = sent[0]?.command as PutObjectCommand;
		expect(put.input).toMatchObject({
			Bucket: "admin-bucket",
			Key: "free.json",
			IfNoneMatch: "*",
		});
		expect(sent[0]?.signal).toBeInstanceOf(AbortSignal);
	});

	test("replace writes only over the version it read, and a lost race answers false", async () => {
		const { client, sent } = fakeClient((command) => {
			if (!(command instanceof PutObjectCommand)) return {};
			if (command.input.IfMatch === '"stale"')
				return s3Error({ name: "PreconditionFailed", status: 412 });
			if (command.input.IfMatch === '"racing"')
				return s3Error({ name: "ConditionalRequestConflict", status: 409 });
			return {};
		});
		const objects = objectsOf(client);
		expect(
			await objects.replace({ key: "k.json", body: "{}", etag: '"fresh"' }),
		).toBe(true);
		expect(
			await objects.replace({ key: "k.json", body: "{}", etag: '"stale"' }),
		).toBe(false);
		expect(
			await objects.replace({ key: "k.json", body: "{}", etag: '"racing"' }),
		).toBe(false);
		expect((sent[0]?.command as PutObjectCommand).input.IfMatch).toBe(
			'"fresh"',
		);
	});

	test("read returns the text and version, or null for a missing key; other failures throw", async () => {
		const { client } = fakeClient((command) => {
			if (!(command instanceof GetObjectCommand)) return {};
			if (command.input.Key === "missing.json")
				return s3Error({ name: "NoSuchKey", status: 404 });
			if (command.input.Key === "broken.json")
				return s3Error({ name: "InternalError", status: 500 });
			return {
				ETag: '"v1"',
				Body: { transformToString: async () => '{"holder":"a"}' },
			};
		});
		const objects = objectsOf(client);
		expect(await objects.read({ key: "k.json" })).toEqual({
			text: '{"holder":"a"}',
			etag: '"v1"',
		});
		expect(await objects.read({ key: "missing.json" })).toBeNull();
		await expect(objects.read({ key: "broken.json" })).rejects.toThrow(
			"InternalError",
		);
	});

	test("list follows every page and keeps each key's ETag, so a caller can tell which objects were written since", async () => {
		const { client } = fakeClient((command) => {
			if (!(command instanceof ListObjectsV2Command)) return {};
			return command.input.ContinuationToken === "page-2"
				? {
						Contents: [{ Key: "p/b.json", ETag: '"e-b"' }],
						IsTruncated: false,
					}
				: {
						Contents: [{ Key: "p/a.json", ETag: '"e-a"' }],
						IsTruncated: true,
						NextContinuationToken: "page-2",
					};
		});
		const objects = objectsOf(client);
		expect(await objects.list({ prefix: "p/" })).toEqual([
			{ key: "p/a.json", etag: '"e-a"' },
			{ key: "p/b.json", etag: '"e-b"' },
		]);
	});

	test("remove deletes the key", async () => {
		const { client, sent } = fakeClient(() => ({}));
		await objectsOf(client).remove({ key: "k.json" });
		expect(sent[0]?.command).toBeInstanceOf(DeleteObjectCommand);
		expect((sent[0]?.command as DeleteObjectCommand).input).toMatchObject({
			Bucket: "admin-bucket",
			Key: "k.json",
		});
	});
});
