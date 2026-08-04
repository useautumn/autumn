import { S3Client } from "@aws-sdk/client-s3";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";
import { DEFAULT_AWS_REGION } from "@/external/aws/awsRegionUtils.js";

type S3Credentials = {
	accessKeyId: string;
	secretAccessKey: string;
};

const s3ClientsByCacheKey = new Map<string, S3Client>();

// Default-chain clients are cached per region; explicitly-credentialed clients
// are cached per (region + access key) so they never collide with the default.
// requestChecksumCalculation is part of the cache key because it changes the
// client's signing behavior — "WHEN_REQUIRED" stops the SDK from injecting a
// default CRC32 checksum, which otherwise breaks browser PUTs to presigned URLs.
export const getS3Client = ({
	region = DEFAULT_AWS_REGION,
	credentials,
	requestChecksumCalculation,
	httpTransport = "node",
}: {
	region?: string;
	credentials?: S3Credentials;
	requestChecksumCalculation?: "WHEN_SUPPORTED" | "WHEN_REQUIRED";
	httpTransport?: "node" | "fetch";
}) => {
	const cacheKey = [
		region,
		credentials?.accessKeyId ?? "",
		requestChecksumCalculation ?? "",
		httpTransport,
	].join(":");

	const existingClient = s3ClientsByCacheKey.get(cacheKey);
	if (existingClient) return existingClient;

	const s3Client = new S3Client({
		region,
		...(credentials ? { credentials } : {}),
		...(requestChecksumCalculation ? { requestChecksumCalculation } : {}),
		...(httpTransport === "fetch"
			? { requestHandler: new FetchHttpHandler() }
			: {}),
	});
	s3ClientsByCacheKey.set(cacheKey, s3Client);
	return s3Client;
};
