import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getS3Client } from "./initS3.js";

export type S3UploadedPart = {
	partNumber: number;
	eTag: string;
};

export const createS3MultipartUpload = async ({
	bucket,
	region,
	key,
	contentType,
}: {
	bucket: string;
	region: string;
	key: string;
	contentType?: string;
}) => {
	const client = getS3Client({ region });

	const response = await client.send(
		new CreateMultipartUploadCommand({
			Bucket: bucket,
			Key: key,
			...(contentType ? { ContentType: contentType } : {}),
		}),
	);

	if (!response.UploadId) {
		throw new Error(`Failed to create multipart upload for ${bucket}/${key}`);
	}

	return { uploadId: response.UploadId };
};

export const uploadS3Part = async ({
	bucket,
	region,
	key,
	uploadId,
	partNumber,
	body,
}: {
	bucket: string;
	region: string;
	key: string;
	uploadId: string;
	partNumber: number;
	body: Uint8Array;
}): Promise<S3UploadedPart> => {
	const client = getS3Client({ region });

	const response = await client.send(
		new UploadPartCommand({
			Bucket: bucket,
			Key: key,
			UploadId: uploadId,
			PartNumber: partNumber,
			Body: body,
		}),
	);

	if (!response.ETag) {
		throw new Error(
			`Upload part ${partNumber} for ${bucket}/${key} returned no ETag`,
		);
	}

	return { partNumber, eTag: response.ETag };
};

export const completeS3MultipartUpload = async ({
	bucket,
	region,
	key,
	uploadId,
	parts,
}: {
	bucket: string;
	region: string;
	key: string;
	uploadId: string;
	parts: S3UploadedPart[];
}) => {
	const client = getS3Client({ region });

	// S3 rejects a completion whose parts are not in ascending part order.
	const orderedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);

	await client.send(
		new CompleteMultipartUploadCommand({
			Bucket: bucket,
			Key: key,
			UploadId: uploadId,
			MultipartUpload: {
				Parts: orderedParts.map((part) => ({
					PartNumber: part.partNumber,
					ETag: part.eTag,
				})),
			},
		}),
	);
};

export const abortS3MultipartUpload = async ({
	bucket,
	region,
	key,
	uploadId,
}: {
	bucket: string;
	region: string;
	key: string;
	uploadId: string;
}) => {
	const client = getS3Client({ region });

	await client.send(
		new AbortMultipartUploadCommand({
			Bucket: bucket,
			Key: key,
			UploadId: uploadId,
		}),
	);
};
