import { type AppEnv, atomDeployments } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** The org and env whose Atom holds this token hash, and its token as pushes carry it; null when no Atom does. */
export const findCacheByTokenHash = async ({
	db,
	tokenHash,
}: {
	db: DrizzleCli;
	tokenHash: string;
}): Promise<{ orgId: string; env: AppEnv; encryptedToken: string } | null> => {
	const [found] = await db
		.select({
			orgId: atomDeployments.org_id,
			env: atomDeployments.env,
			encryptedToken: atomDeployments.encrypted_token,
		})
		.from(atomDeployments)
		.where(eq(atomDeployments.token_hash, tokenHash))
		.limit(1);
	return found ?? null;
};
