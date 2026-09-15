import type { DrizzleCli } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import { hashAgentAuthSubject } from "../agentAuthUtils.js";
import { findAgentClaimAttempt } from "../repos/agentChallengeRepo.js";
import { findPendingAgentOrg } from "../repos/agentOrgRepo.js";

export const getAgentClaimAttempt = async ({
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
	const session = await auth.api.getSession({ headers });
	if (!session) return { kind: "unauthenticated" as const };

	const attempt = await findAgentClaimAttempt({
		db,
		attemptTokenHash: hashAgentAuthSubject({ value: attemptToken }),
	});
	if (!attempt || new Date(attempt.expiresAt) <= now) {
		return { kind: "invalid" as const };
	}

	const organization = await findPendingAgentOrg({
		db,
		claimTokenHash: attempt.claimTokenHash,
		now,
	});
	if (!organization) return { kind: "invalid" as const };

	return {
		kind: "ready" as const,
		attempt,
		organization,
		session,
	};
};
