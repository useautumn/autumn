import { member } from "@autumn/shared";
import type { GenericEndpointContext } from "@better-auth/core";
import type { BetterAuthOptions, Session } from "better-auth";
import { APIError } from "better-auth/api";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import {
	ensureInvitedSsoMembership,
	getSsoProviderIdFromCallbackPath,
	removeRejectedSsoAccount,
	userRequiresSso,
} from "@/internal/auth/sso/ssoInvitationProvisioning.js";
import { createDefaultOrg } from "@/utils/authUtils/createDefaultOrg.js";

export const beforeSessionCreated = async (
	session: Session,
	context: GenericEndpointContext<BetterAuthOptions> | null,
) => {
	const providerId = getSsoProviderIdFromCallbackPath(
		context?.path,
		context?.params as Record<string, unknown> | undefined,
	);
	let requiresSso = false;
	try {
		// Impersonation sets its own active org; don't override with the
		// target user's most-recent membership.
		if ((session as { impersonatedBy?: string | null }).impersonatedBy) {
			return;
		}

		if (providerId) {
			const ssoMembership = await ensureInvitedSsoMembership({
				db,
				userId: session.userId,
				providerId,
			});
			if (!ssoMembership) {
				await removeRejectedSsoAccount({
					db,
					userId: session.userId,
					providerId,
				});
				throw new APIError("FORBIDDEN", {
					message: "An active organization invitation is required for SSO",
				});
			}
			return {
				data: {
					...session,
					activeOrganizationId: ssoMembership.organizationId,
				},
			};
		}

		requiresSso = await userRequiresSso({ db, userId: session.userId });
		if (requiresSso) {
			throw new APIError("FORBIDDEN", {
				message: "This account must sign in with SSO",
			});
		}

		const membership = await db.query.member.findFirst({
			where: eq(member.userId, session.userId),
			orderBy: [desc(member.createdAt)],
		});

		if (membership) {
			return {
				data: {
					...session,
					activeOrganizationId: membership.organizationId,
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
	} catch (error) {
		if (providerId || requiresSso) throw error;
	}
};
