import { type ApiKey, apiKeys } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const insertApiKey = async ({
	db,
	apiKey,
}: {
	db: Pick<DrizzleCli, "insert">;
	apiKey: ApiKey;
}) => {
	await db.insert(apiKeys).values(apiKey);
};
