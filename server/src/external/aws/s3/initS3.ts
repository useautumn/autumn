import { S3Client } from "@aws-sdk/client-s3";
import { DEFAULT_AWS_REGION } from "@/external/aws/awsRegionUtils.js";

const s3ClientsByRegion = new Map<string, S3Client>();

export const getS3Client = ({
	region = DEFAULT_AWS_REGION,
}: {
	region?: string;
}) => {
	const existingClient = s3ClientsByRegion.get(region);
	if (existingClient) return existingClient;

	const s3Client = new S3Client({ region });
	s3ClientsByRegion.set(region, s3Client);
	return s3Client;
};
