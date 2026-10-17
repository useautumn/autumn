import {
	DeleteObjectCommand,
	GetObjectCommand,
	type GetObjectCommandOutput,
	ListObjectsV2Command,
	type ListObjectsV2CommandOutput,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import type {
	AdminBucketObjects,
	AdminObject,
	AdminObjectListing,
	AdminS3Client,
} from "./types/adminBucketObjects.js";

export function createAdminBucketObjects({
	ctx,
	config,
}: {
	ctx: { client: AdminS3Client };
	config: { bucket: string; timeoutMs: number };
}): AdminBucketObjects {
	const { bucket: Bucket } = config;

	function send(command: unknown): Promise<unknown> {
		return ctx.client.send(command, {
			abortSignal: AbortSignal.timeout(config.timeoutMs),
		});
	}

	async function list({
		prefix,
	}: {
		prefix: string;
	}): Promise<AdminObjectListing[]> {
		const listed: AdminObjectListing[] = [];
		let ContinuationToken: string | undefined;
		do {
			const page = (await send(
				new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }),
			)) as ListObjectsV2CommandOutput;
			for (const { Key, LastModified } of page.Contents ?? [])
				if (Key && LastModified)
					listed.push({ key: Key, lastModifiedAt: LastModified.getTime() });
			ContinuationToken = page.IsTruncated
				? page.NextContinuationToken
				: undefined;
		} while (ContinuationToken);
		return listed;
	}

	async function read({ key }: { key: string }): Promise<AdminObject | null> {
		try {
			const object = (await send(
				new GetObjectCommand({ Bucket, Key: key }),
			)) as GetObjectCommandOutput;
			return {
				text: (await object.Body?.transformToString()) ?? "",
				etag: object.ETag ?? "",
			};
		} catch (cause) {
			if (statusOf(cause) === 404) return null;
			throw cause;
		}
	}

	async function write({
		key,
		body,
		condition,
	}: {
		key: string;
		body: string;
		condition: { IfNoneMatch: "*" } | { IfMatch: string };
	}): Promise<boolean> {
		try {
			await send(
				new PutObjectCommand({
					Bucket,
					Key: key,
					Body: body,
					ContentType: "application/json",
					...condition,
				}),
			);
			return true;
		} catch (cause) {
			if (isLostRace(cause)) return false;
			throw cause;
		}
	}

	function create({ key, body }: { key: string; body: string }) {
		return write({ key, body, condition: { IfNoneMatch: "*" } });
	}

	function replace({
		key,
		body,
		etag,
	}: {
		key: string;
		body: string;
		etag: string;
	}) {
		return write({ key, body, condition: { IfMatch: etag } });
	}

	async function remove({ key }: { key: string }): Promise<void> {
		await send(new DeleteObjectCommand({ Bucket, Key: key }));
	}

	return { list, read, create, replace, remove };
}

function statusOf(cause: unknown): number | undefined {
	return (cause as { $metadata?: { httpStatusCode?: number } } | null)
		?.$metadata?.httpStatusCode;
}

function isLostRace(cause: unknown): boolean {
	const status = statusOf(cause);
	return status === 412 || status === 409;
}
