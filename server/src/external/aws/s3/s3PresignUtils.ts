import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "./initS3.js";

const PRESIGNED_URL_EXPIRES_IN = 300;

export const getS3PresignedPutUrl = async ({
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
