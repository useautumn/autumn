import type { GenericEndpointContext } from "@better-auth/core";
import type { BetterAuthOptions, Session } from "better-auth";
import {
	orgRequiresPasskey,
	pickPasskeyAllowedOrg,
	userHasPasskey,
} from "@/utils/authUtils/passkeyEnforcement.js";

/**
 * Hook called before any `session` row update — including the one
 * better-auth's organization plugin issues from `/organization/set-active`.
 *
 * If the incoming change targets a passkey-gated org and the session's
 * user has no passkey, we rewrite the update to either fall back to a
 * different allowed org or clear `activeOrganizationId` entirely. We do
 * NOT return `false`: better-auth's `/set-active` swallows that result
 * and the client would just see a stale active org without a meaningful
 * error message. The client also gates the switcher up front; this hook
 * is the defence-in-depth backstop.
 *
 * better-auth invokes update hooks with `(data, ctx)` where `data` is the
 * partial patch (just `{ activeOrganizationId }` for `set-active`) — the
 * `where` clause is NOT passed. The current user is therefore resolved
 * from `ctx.context.session`, populated by the org plugin's
 * `orgSessionMiddleware` before this hook fires.
 */
export const beforeSessionUpdated = async (
	patch: Partial<Session> & Record<string, unknown>,
	context: GenericEndpointContext<BetterAuthOptions> | null,
) => {
	try {
		const incoming = patch as { activeOrganizationId?: string | null };
		if (!incoming.activeOrganizationId) return;

		const userId =
			(typeof patch.userId === "string" ? patch.userId : null) ??
			context?.context.session?.user?.id ??
			null;
		if (!userId) return;

		const orgId = incoming.activeOrganizationId;
		const requiresPasskey = await orgRequiresPasskey({ orgId });
		if (!requiresPasskey) return;
		if (await userHasPasskey({ userId })) return;

		const fallback = await pickPasskeyAllowedOrg({
			userId,
			excludeOrgId: orgId,
		});

		return {
			data: {
				...patch,
				activeOrganizationId: fallback,
			},
		};
	} catch (error) {
		// Hook errors are swallowed so we don't break the broader update
		// path; the client-side gate keeps the UX honest if this ever
		// fails. Log via console so it shows up in dev tail without
		// pulling in the logtail wrapper.
		console.error("[beforeSessionUpdated] failed to enforce passkey:", error);
	}
};
