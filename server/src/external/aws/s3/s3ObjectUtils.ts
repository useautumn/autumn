import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "./initS3.js";

const isNotFoundError = (error: unknown) => {
	if (typeof error !== "object" || error === null) return false;
	const candidate = error as {
		name?: unknown;
		$metadata?: { httpStatusCode?: number };
	};
	return (
		candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404
	);
};

export const headS3Object = async ({
	bucket,
	region,
	key,
}: {
	bucket: string;
	region: string;
	key: string;
}): Promise<{ exists: boolean; contentLength: number | null }> => {
	const client = getS3Client({ region });

	try {
		const response = await client.send(
			new HeadObjectCommand({ Bucket: bucket, Key: key }),
		);
		return { exists: true, contentLength: response.ContentLength ?? null };
	} catch (error) {
		if (isNotFoundError(error)) return { exists: false, contentLength: null };
		throw error;
	}
};
