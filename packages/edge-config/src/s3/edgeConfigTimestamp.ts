import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { EDGE_CONFIG_TIMESTAMP_KEY } from "../keys.js";
import type { EdgeConfigContext } from "../types/edgeConfig.js";
import {
	createBunS3EdgeConfigClient,
	getS3BodyAsString,
} from "./bunS3EdgeConfigClient.js";

const clientOf = ({ ctx }: { ctx: EdgeConfigContext }) =>
	ctx.s3Client ??
	createBunS3EdgeConfigClient({ region: ctx.location().region });

export const readEdgeConfigTimestamp = async ({
	ctx,
}: {
	ctx: EdgeConfigContext;
}): Promise<string | null> => {
	const { bucket } = ctx.location();
	try {
		const response = await clientOf({ ctx }).send(
			new GetObjectCommand({ Bucket: bucket, Key: EDGE_CONFIG_TIMESTAMP_KEY }),
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

const WRITE_ATTEMPTS = 3;
const WRITE_RETRY_DELAY_MS = 50;

/** Retries because the config object is already written by the time this runs:
 *  a lost timestamp leaves that config in S3 with nothing signalling it. */
export const writeEdgeConfigTimestamp = async ({
	ctx,
}: {
	ctx: EdgeConfigContext;
}): Promise<string> => {
	const { bucket } = ctx.location();
	const client = clientOf({ ctx });
	let lastError: unknown;
	for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
		// Fresh marker per attempt: a retry reusing the first marker can overwrite a
		// concurrent writer's signal with a value pollers already observed.
		const updatedAt = new Date().toISOString();
		const changeId = randomUUID();
		try {
			await client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: EDGE_CONFIG_TIMESTAMP_KEY,
					Body: JSON.stringify({ updatedAt, changeId }),
					ContentType: "application/json",
				}),
			);
			return `${updatedAt}:${changeId}`;
		} catch (error) {
			lastError = error;
			if (attempt < WRITE_ATTEMPTS) {
				await new Promise((resolve) =>
					setTimeout(resolve, WRITE_RETRY_DELAY_MS * attempt),
				);
			}
		}
	}
	throw lastError;
};
