import {
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";

export type S3CheckpointObjectHead = {
	contentEncoding: string | null;
	contentLength: number | null;
	contentType: string | null;
	etag: string | null;
	metadata: Readonly<Record<string, string>>;
};

export type S3CheckpointObject = S3CheckpointObjectHead & {
	body: unknown;
};

export type S3CheckpointPutCondition =
	| { kind: "absent" }
	| { kind: "etag"; etag: string };

export type S3CheckpointPutInput = {
	bucket: string;
	key: string;
	body: Uint8Array;
	contentEncoding: string;
	contentType: string;
	metadata: Readonly<Record<string, string>>;
	condition: S3CheckpointPutCondition;
	signal: AbortSignal;
};

export type S3CheckpointObjectClient = {
	head({
		bucket,
		key,
		signal,
	}: {
		bucket: string;
		key: string;
		signal: AbortSignal;
	}): Promise<S3CheckpointObjectHead | null>;
	get({
		bucket,
		key,
		signal,
	}: {
		bucket: string;
		key: string;
		signal: AbortSignal;
	}): Promise<S3CheckpointObject | null>;
	put(input: S3CheckpointPutInput): Promise<{ etag: string }>;
};

const statusCodeOf = ({ error }: { error: unknown }): number | null => {
	if (typeof error !== "object" || error === null || !("$metadata" in error)) {
		return null;
	}
	const metadata = error.$metadata;
	if (
		typeof metadata !== "object" ||
		metadata === null ||
		!("httpStatusCode" in metadata)
	) {
		return null;
	}
	return typeof metadata.httpStatusCode === "number"
		? metadata.httpStatusCode
		: null;
};

const isMissingObject = ({ error }: { error: unknown }): boolean =>
	statusCodeOf({ error }) === 404 &&
	typeof error === "object" &&
	error !== null &&
	"name" in error &&
	(error.name === "NoSuchKey" || error.name === "NotFound");

const metadataOf = ({
	metadata,
}: {
	metadata: Record<string, string> | undefined;
}): Record<string, string> => metadata ?? {};

export const createS3CheckpointObjectClient = ({
	client,
}: {
	client: S3Client;
}): S3CheckpointObjectClient => ({
	head: async ({ bucket, key, signal }) => {
		try {
			const response = await client.send(
				new HeadObjectCommand({ Bucket: bucket, Key: key }),
				{ abortSignal: signal },
			);
			return {
				contentEncoding: response.ContentEncoding ?? null,
				contentLength: response.ContentLength ?? null,
				contentType: response.ContentType ?? null,
				etag: response.ETag ?? null,
				metadata: metadataOf({ metadata: response.Metadata }),
			};
		} catch (cause) {
			if (isMissingObject({ error: cause })) return null;
			throw cause;
		}
	},
	get: async ({ bucket, key, signal }) => {
		try {
			const response = await client.send(
				new GetObjectCommand({ Bucket: bucket, Key: key }),
				{ abortSignal: signal },
			);
			return {
				body: response.Body,
				contentEncoding: response.ContentEncoding ?? null,
				contentLength: response.ContentLength ?? null,
				contentType: response.ContentType ?? null,
				etag: response.ETag ?? null,
				metadata: metadataOf({ metadata: response.Metadata }),
			};
		} catch (cause) {
			if (isMissingObject({ error: cause })) return null;
			throw cause;
		}
	},
	put: async ({
		bucket,
		key,
		body,
		contentEncoding,
		contentType,
		metadata,
		condition,
		signal,
	}) => {
		const response = await client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				Body: body,
				ContentEncoding: contentEncoding,
				ContentType: contentType,
				Metadata: metadata,
				...(condition.kind === "absent"
					? { IfNoneMatch: "*" }
					: { IfMatch: condition.etag }),
			}),
			{ abortSignal: signal },
		);
		if (!response.ETag) throw new Error(`S3 PUT ${key} returned no ETag`);
		return { etag: response.ETag };
	},
});
