import { member } from "@autumn/shared";
import type {
	BetterAuthOptions,
	GenericEndpointContext,
	Session,
} from "better-auth";
import { APIError } from "better-auth/api";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import {
	ensureInvitedSsoMembership,
	getSsoProviderIdFromCallbackPath,
	getSsoProviderOrganizationName,
	removeRejectedSsoAccount,
	userRequiresSso,
} from "@/internal/auth/sso/ssoInvitationProvisioning.js";
import {
	getAgentClaimIntentFromHeaders,
	hashAgentAuthSubject,
} from "@/internal/orgs/agentOnboarding/agentAuthUtils.js";
import { findAgentClaimAttempt } from "@/internal/orgs/agentOnboarding/repos/agentChallengeRepo.js";
import { createDefaultOrg } from "@/utils/authUtils/createDefaultOrg.js";

/** Sent with /admin/impersonate-user so the session is born in the target org. */
const IMPERSONATE_ORG_HEADER = "x-impersonate-org-id";

const getImpersonationActiveOrgId = async ({
	headers,
	userId,
}: {
	headers: HeadersInit | undefined;
	userId: string;
}) => {
	const orgId = new Headers(headers).get(IMPERSONATE_ORG_HEADER);
	if (!orgId) return null;
	const membership = await db.query.member.findFirst({
		where: and(eq(member.userId, userId), eq(member.organizationId, orgId)),
	});
	return membership ? orgId : null;
};

const hasPendingAgentClaimIntent = async ({
	headers,
}: {
	headers: HeadersInit | undefined;
}) => {
	const attemptToken = getAgentClaimIntentFromHeaders({ headers });
	if (!attemptToken) return false;
	const attempt = await findAgentClaimAttempt({
		db,
		attemptTokenHash: hashAgentAuthSubject({ value: attemptToken }),
	});
	return !!attempt && new Date(attempt.expiresAt) > new Date();
};

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
		if (await hasPendingAgentClaimIntent({ headers: context?.headers })) {
			return;
		}

		// Start impersonation sessions in the requested org. Leaving the active
		// org null until a follow-up setActive races other open dashboard tabs,
		// whose no-active-org fallback would switch the session to a random org.
		if ((session as { impersonatedBy?: string | null }).impersonatedBy) {
			const activeOrganizationId = await getImpersonationActiveOrgId({
				headers: context?.headers,
				userId: session.userId,
			});
			if (!activeOrganizationId) return;
			return { data: { ...session, activeOrganizationId } };
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
