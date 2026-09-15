import type { DrizzleCli } from "@/db/initDrizzle.js";
import { hashApiKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { sendAgentClaimEmail } from "@/internal/emails/sendAgentClaimEmail.js";
import {
	AGENT_CLAIM_ATTEMPT_TTL_MS,
	type AgentClaimAttempt,
	AgentClaimPurpose,
	buildAgentClaimUrl,
	createAgentClaimAttemptToken,
	hashAgentAuthSubject,
	hashAgentClaimToken,
} from "../../agentAuthUtils.js";
import { createAgentClaimAttempt } from "../../repos/agentChallengeRepo.js";
import {
	findPendingAgentOrg,
	findPendingAgentOrgBySetupKeyHash,
} from "../../repos/agentOrgRepo.js";

export type ResolvedAgentAuthIdentity =
	| { kind: "invalid" }
	| {
			kind: "claim";
			claimTokenHash: string;
			organizationName: string;
	  };

export const resolveClaimIdentity = async ({
	db,
	claimToken,
	setupKey,
	now,
}: {
	db: DrizzleCli;
	claimToken?: string;
	setupKey?: string;
	now: Date;
}): Promise<ResolvedAgentAuthIdentity> => {
	const hasClaimToken = Boolean(claimToken);
	const hasSetupKey = Boolean(setupKey);
	if (hasClaimToken === hasSetupKey) return { kind: "invalid" };

	if (claimToken) {
		const claimTokenHash = hashAgentClaimToken({ claimToken });
		const organization = await findPendingAgentOrg({
			db,
			claimTokenHash,
			now,
		});
		return organization
			? {
					kind: "claim",
					claimTokenHash,
					organizationName: organization.name,
				}
			: { kind: "invalid" };
	}

	if (!setupKey) return { kind: "invalid" };

	const organization = await findPendingAgentOrgBySetupKeyHash({
		db,
		hashedKey: hashApiKey(setupKey),
		now,
	});
	return organization?.claim_token_hash
		? {
				kind: "claim",
				claimTokenHash: organization.claim_token_hash,
				organizationName: organization.name,
			}
		: { kind: "invalid" };
};

export const issueAgentAuthChallenge = async ({
	db,
	email,
	claimTokenHash,
	organizationName,
	now,
}: {
	db: DrizzleCli;
	email: string;
	claimTokenHash: string;
	organizationName: string;
	now: Date;
}) => {
	const attemptToken = createAgentClaimAttemptToken();
	const attemptTokenHash = hashAgentAuthSubject({ value: attemptToken });
	const expiresAt = new Date(now.getTime() + AGENT_CLAIM_ATTEMPT_TTL_MS);
	const attempt: AgentClaimAttempt = {
		version: 1,
		purpose: AgentClaimPurpose.Claim,
		email,
		claimTokenHash,
		attemptTokenHash,
		expiresAt: expiresAt.toISOString(),
	};
	const claimUrl = buildAgentClaimUrl({ attemptToken });

	await createAgentClaimAttempt({ db, attempt });
	await sendAgentClaimEmail({
		email,
		organizationName,
		claimUrl,
		expiresAt,
	});

	return { claimUrl, expiresAt };
};
