import { type ApiKey, apiKeys } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const insertApiKey = async ({
	db,
	apiKey,
}: {
	db: DrizzleCli;
	apiKey: ApiKey;
}) => {
	await db.insert(apiKeys).values(apiKey);
};
