import { S3Client } from "@aws-sdk/client-s3";
import { DEFAULT_AWS_REGION } from "@/external/aws/awsRegionUtils.js";

type S3Credentials = {
	accessKeyId: string;
	secretAccessKey: string;
};

const s3ClientsByCacheKey = new Map<string, S3Client>();

// default CRC32 checksum, which otherwise breaks browser PUTs to presigned URLs.
export const getS3Client = ({
	region = DEFAULT_AWS_REGION,
	credentials,
	requestChecksumCalculation,
}: {
	region?: string;
	credentials?: S3Credentials;
	requestChecksumCalculation?: "WHEN_SUPPORTED" | "WHEN_REQUIRED";
}) => {
	const cacheKey = [
		region,
		credentials?.accessKeyId ?? "",
		requestChecksumCalculation ?? "",
	].join(":");

	const existingClient = s3ClientsByCacheKey.get(cacheKey);
	if (existingClient) return existingClient;

	const s3Client = new S3Client({
		region,
		...(credentials ? { credentials } : {}),
		...(requestChecksumCalculation ? { requestChecksumCalculation } : {}),
	});
	s3ClientsByCacheKey.set(cacheKey, s3Client);
	return s3Client;
};
