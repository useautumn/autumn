import type { DrizzleCli } from "@/db/initDrizzle.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { hashAgentAuthSubject } from "../agentAuthUtils.js";
import { commitAgentAuthEffects } from "./commitAgentAuthEffects.js";
import { getAgentClaimAttempt } from "./getAgentClaimAttempt.js";

export const completeAgentClaim = async ({
	db,
	attemptToken,
	headers,
	now = new Date(),
}: {
	db: DrizzleCli;
	attemptToken: string;
	headers: Headers;
	now?: Date;
}) => {
	const resolved = await getAgentClaimAttempt({
		db,
		attemptToken,
		headers,
		now,
	});
	if (resolved.kind !== "ready") return resolved;

	const committed = await commitAgentAuthEffects({
		db,
		attemptTokenHash: hashAgentAuthSubject({ value: attemptToken }),
		sessionToken: resolved.session.session.token,
		userId: resolved.session.user.id,
		now,
	});
	if (!committed) return { kind: "invalid" as const };

	await clearOrgCache({ db, orgId: committed.organization.id });
	return {
		kind: "claimed" as const,
		organization: committed.organization,
		user: resolved.session.user,
	};
};
