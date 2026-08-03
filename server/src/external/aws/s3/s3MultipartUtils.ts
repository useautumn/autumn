import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "./initS3.js";

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
