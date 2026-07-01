import { member } from "@autumn/shared";
import type { Session } from "better-auth";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import { createDefaultOrg } from "@/utils/authUtils/createDefaultOrg.js";
import {
	orgRequiresPasskey,
	pickPasskeyAllowedOrg,
	userHasPasskey,
} from "@/utils/authUtils/passkeyEnforcement.js";

export const beforeSessionCreated = async (session: Session) => {
	try {
		// Impersonation sets its own active org; don't override with the
		// target user's most-recent membership.
		if ((session as { impersonatedBy?: string | null }).impersonatedBy) {
			return;
		}

		const membership = await db.query.member.findFirst({
			where: eq(member.userId, session.userId),
			orderBy: [desc(member.createdAt)],
		});

		if (membership) {
			// If the most-recent org is passkey-gated and the user has no
			// credential, walk back through their other memberships and
			// surface the first non-gated one. Falls through to null if
			// every org gates them — DashboardGate renders the no-org
			// state, prompting them to register a passkey from settings.
			const activeOrgId = await resolveAllowedActiveOrg({
				userId: session.userId,
				preferredOrgId: membership.organizationId,
			});

			return {
				data: {
					...session,
					activeOrganizationId: activeOrgId,
				},
			};
		}

		const orgId = await createDefaultOrg({ session });

		return {
			data: {
				...session,
				activeOrganizationId: orgId,
			},
		};
	} catch (error) {}
};

const resolveAllowedActiveOrg = async ({
	userId,
	preferredOrgId,
}: {
	userId: string;
	preferredOrgId: string;
}): Promise<string | null> => {
	const requiresPasskey = await orgRequiresPasskey({ orgId: preferredOrgId });
	if (!requiresPasskey) return preferredOrgId;
	if (await userHasPasskey({ userId })) return preferredOrgId;
	const fallback = await pickPasskeyAllowedOrg({
		userId,
		excludeOrgId: preferredOrgId,
	});
	return fallback;
};
