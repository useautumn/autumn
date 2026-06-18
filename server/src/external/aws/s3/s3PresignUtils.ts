import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "./initS3.js";

const PRESIGNED_URL_EXPIRES_IN = 300;

type S3Credentials = {
	accessKeyId: string;
	secretAccessKey: string;
};

// Reuse a client per (region + access key) so we don't rebuild it per request.
const credentialedClients = new Map<string, S3Client>();

const getCredentialedClient = (region: string, credentials: S3Credentials) => {
	const cacheKey = `${region}:${credentials.accessKeyId}`;
	const existing = credentialedClients.get(cacheKey);
	if (existing) return existing;

	const client = new S3Client({ region, credentials });
	credentialedClients.set(cacheKey, client);
	return client;
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
	const client = credentials
		? getCredentialedClient(region, credentials)
		: getS3Client({ region });

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
