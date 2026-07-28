import { member } from "@autumn/shared";
import type { GenericEndpointContext } from "@better-auth/core";
import type { BetterAuthOptions, Session } from "better-auth";
import { APIError } from "better-auth/api";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import {
	ensureInvitedSsoMembership,
	getSsoProviderIdFromCallbackPath,
	getSsoProviderOrganizationName,
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
				const orgName = await getSsoProviderOrganizationName({
					db,
					providerId,
				});
				// better-auth only redirects the callback when `code` is set;
				// without it the raw APIError body is served as JSON.
				throw new APIError("FORBIDDEN", {
					code: "SSO_INVITATION_REQUIRED",
					message: `Ask your Autumn admin to invite you to ${orgName ?? "this organization"} before signing in with SSO.`,
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
