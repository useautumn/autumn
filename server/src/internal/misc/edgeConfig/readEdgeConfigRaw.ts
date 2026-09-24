import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getAdminS3Config } from "@/external/aws/s3/adminS3Config.js";
import {
	createBunS3EdgeConfigClient,
	type EdgeConfigS3Client,
} from "@/external/aws/s3/bunS3EdgeConfigClient.js";
import { getS3BodyAsString } from "@/external/aws/s3/s3Utils.js";

/** Trimmed object body, or null for a missing or empty object. Never parses:
 *  the cluster relay forwards it to forks, which parse with their own schema. */
export const readEdgeConfigRaw = async ({
	key,
	s3Client,
}: {
	key: string;
	s3Client?: EdgeConfigS3Client;
}): Promise<string | null> => {
	const { bucket, region } = getAdminS3Config();
	const client = s3Client ?? createBunS3EdgeConfigClient({ region });
	try {
		const response = await client.send(
			new GetObjectCommand({ Bucket: bucket, Key: key }),
		);
		if (!response.Body) return null;

		const raw = (await getS3BodyAsString({ body: response.Body })).trim();
		return raw || null;
	} catch (error) {
		if (error instanceof Error && error.name === "NoSuchKey") return null;
		throw error;
	}
};
