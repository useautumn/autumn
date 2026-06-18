import { S3Client } from "@aws-sdk/client-s3";
import { DEFAULT_AWS_REGION } from "@/external/aws/awsRegionUtils.js";

type S3Credentials = {
	accessKeyId: string;
	secretAccessKey: string;
};

const s3ClientsByCacheKey = new Map<string, S3Client>();

// Default-chain clients are cached per region; explicitly-credentialed clients
// are cached per (region + access key) so they never collide with the default.
export const getS3Client = ({
	region = DEFAULT_AWS_REGION,
	credentials,
}: {
	region?: string;
	credentials?: S3Credentials;
}) => {
	const cacheKey = credentials
		? `${region}:${credentials.accessKeyId}`
		: region;

	const existingClient = s3ClientsByCacheKey.get(cacheKey);
	if (existingClient) return existingClient;

	const s3Client = new S3Client(
		credentials ? { region, credentials } : { region },
	);
	s3ClientsByCacheKey.set(cacheKey, s3Client);
	return s3Client;
};
