import { session } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

// Writes the column directly: better-auth's set-active refuses orgs the user isn't a member of
export const setSessionActiveOrg = async ({
	db,
	sessionId,
	orgId,
}: {
	db: DrizzleCli;
	sessionId: string;
	orgId: string;
}) => {
	const updated = await db
		.update(session)
		.set({ activeOrganizationId: orgId })
		.where(eq(session.id, sessionId))
		.returning({ id: session.id });

	return updated.length === 1;
};
