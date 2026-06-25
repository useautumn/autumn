import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "./initS3.js";

const PRESIGNED_URL_EXPIRES_IN = 300;

type S3Credentials = {
	accessKeyId: string;
	secretAccessKey: string;
};

export const getS3PresignedPutUrl = async ({
	bucket,
	region,
	key,
	contentType,
	credentials,
}: {
	bucket: string;
	region: string;
	key: string;
	contentType?: string;
	credentials?: S3Credentials;
}) => {
	// WHEN_REQUIRED keeps the SDK from baking a default CRC32 checksum into the
	// presigned URL — the browser PUT can't reproduce it and S3 would reject it.
	const client = getS3Client({
		region,
		credentials,
		requestChecksumCalculation: "WHEN_REQUIRED",
	});

	const command = new PutObjectCommand({
		Bucket: bucket,
		Key: key,
		...(contentType ? { ContentType: contentType } : {}),
	});

	const signedUrl = await getSignedUrl(client, command, {
		expiresIn: PRESIGNED_URL_EXPIRES_IN,
	});

	return signedUrl;
};

export const deleteS3Object = async ({
	bucket,
	region,
	key,
	credentials,
}: {
	bucket: string;
	region: string;
	key: string;
	credentials?: S3Credentials;
}) => {
	const client = getS3Client({ region, credentials });

	await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
};
