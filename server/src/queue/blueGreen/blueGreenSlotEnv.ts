import { randomUUID } from "node:crypto";

let cachedInstanceId: string | null = null;

/** Stable per-process id. pid + short uuid keeps it human-skimmable in S3 listings. */
export const getInstanceId = (): string => {
	if (cachedInstanceId) return cachedInstanceId;
	const shortId = randomUUID().split("-")[0];
	cachedInstanceId = `${process.pid}-${shortId}`;
	return cachedInstanceId;
};
