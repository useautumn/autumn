import { randomUUID } from "node:crypto";

let cachedInstanceId: string | null = null;

export const getInstanceId = (): string => {
	if (cachedInstanceId) return cachedInstanceId;
	const shortId = randomUUID().split("-")[0];
	cachedInstanceId = `${process.pid}-${shortId}`;
	return cachedInstanceId;
};
