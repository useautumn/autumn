import { member, organizations, passkey } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";

/**
 * Returns true iff the org has the `require_passkey` config flag set.
 *
 * Cheap lookup — the row is in pg, the column is jsonb, and we only need
 * one boolean. Called from the session-update hook on every org switch.
 */
export const orgRequiresPasskey = async ({
	orgId,
}: {
	orgId: string;
}): Promise<boolean> => {
	const row = await db.query.organizations.findFirst({
		columns: { config: true },
		where: eq(organizations.id, orgId),
	});
	return row?.config?.require_passkey === true;
};

/** True iff the user has at least one registered WebAuthn credential. */
export const userHasPasskey = async ({
	userId,
}: {
	userId: string;
}): Promise<boolean> => {
	const row = await db.query.passkey.findFirst({
		columns: { id: true },
		where: eq(passkey.userId, userId),
	});
	return Boolean(row);
};

/**
 * Pick the first org the user is a member of (most-recently-joined first)
 * that is NOT gated behind a passkey requirement. Used to override the
 * resolved active org during session create when the stored membership
 * points at a gated org and the user has no passkey.
 *
 * Returns null when every membership is gated — DashboardGate handles the
 * "no eligible org" case by rendering an empty state.
 */
export const pickPasskeyAllowedOrg = async ({
	userId,
	excludeOrgId,
}: {
	userId: string;
	excludeOrgId?: string;
}): Promise<string | null> => {
	const rows = await db
		.select({
			organizationId: member.organizationId,
			config: organizations.config,
			createdAt: member.createdAt,
		})
		.from(member)
		.innerJoin(organizations, eq(member.organizationId, organizations.id))
		.where(eq(member.userId, userId));

	const sorted = rows.sort(
		(a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
	);
	for (const row of sorted) {
		if (excludeOrgId && row.organizationId === excludeOrgId) continue;
		if (row.config?.require_passkey === true) continue;
		return row.organizationId;
	}
	return null;
};
