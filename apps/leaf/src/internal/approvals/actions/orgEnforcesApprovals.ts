import { organizations } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { db } from "../../../lib/db.js";

/** Whether the org has turned approval rules from shadow mode into enforcement. */
export const orgEnforcesApprovals = async ({
	orgId,
}: {
	orgId: string;
}): Promise<boolean> => {
	const org = await db.query.organizations.findFirst({
		where: eq(organizations.id, orgId),
		columns: { config: true },
	});
	const config = org?.config as { approvals_enforced?: boolean } | null;
	return config?.approvals_enforced === true;
};
