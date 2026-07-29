import { randomUUID } from "node:crypto";
import type { S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
	ADMIN_EDGE_CONFIG_TIMESTAMP_KEY,
	getAdminS3Config,
} from "@/external/aws/s3/adminS3Config.js";
import { getS3Client } from "@/external/aws/s3/initS3.js";
import { getS3BodyAsString } from "@/external/aws/s3/s3Utils.js";

const getClient = (s3Client?: S3Client) => {
	if (s3Client) return s3Client;
	const { region } = getAdminS3Config();
	return getS3Client({ region });
};

export const readEdgeConfigTimestamp = async ({
	s3Client,
}: {
	s3Client?: S3Client;
} = {}): Promise<string | null> => {
	const { bucket } = getAdminS3Config();

	try {
		const response = await getClient(s3Client).send(
			new GetObjectCommand({
				Bucket: bucket,
				Key: ADMIN_EDGE_CONFIG_TIMESTAMP_KEY,
			}),
		);
		if (!response.Body) return null;

		const raw = await getS3BodyAsString({ body: response.Body });
		const { updatedAt, changeId } = JSON.parse(raw) as {
			updatedAt?: unknown;
			changeId?: unknown;
		};
		if (typeof updatedAt !== "string") {
			throw new Error("Edge config timestamp is invalid");
		}
		return typeof changeId === "string"
			? `${updatedAt}:${changeId}`
			: updatedAt;
	} catch (error) {
		if (error instanceof Error && error.name === "NoSuchKey") return null;
		throw error;
	}
};

export const writeEdgeConfigTimestamp = async ({
	s3Client,
}: {
	s3Client?: S3Client;
} = {}): Promise<string> => {
	const { bucket } = getAdminS3Config();
	const updatedAt = new Date().toISOString();
	const changeId = randomUUID();

	await getClient(s3Client).send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: ADMIN_EDGE_CONFIG_TIMESTAMP_KEY,
			Body: JSON.stringify({ updatedAt, changeId }),
			ContentType: "application/json",
		}),
	);

	return `${updatedAt}:${changeId}`;
};
