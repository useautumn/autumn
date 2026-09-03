import type { DrizzleCli } from "@/db/initDrizzle.js";
import { hashApiKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { auth } from "@/utils/auth.js";
import {
	AGENT_AUTH_CHALLENGE_TTL_MS,
	type AgentAuthChallenge,
	AgentAuthPurpose,
	hashAgentClaimToken,
} from "../../agentAuthUtils.js";
import {
	createAgentChallenge,
	deleteAgentChallenge,
} from "../../repos/agentChallengeRepo.js";
import {
	findPendingAgentOrg,
	findPendingAgentOrgBySetupKeyHash,
} from "../../repos/agentOrgRepo.js";

export type ResolvedAgentAuthIdentity =
	| { kind: "invalid" }
	| { kind: "claim"; claimTokenHash: string };

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
			? { kind: "claim", claimTokenHash }
			: { kind: "invalid" };
	}

	if (!setupKey) return { kind: "invalid" };

	const organization = await findPendingAgentOrgBySetupKeyHash({
		db,
		hashedKey: hashApiKey(setupKey),
		now,
	});
	return organization?.claim_token_hash
		? { kind: "claim", claimTokenHash: organization.claim_token_hash }
		: { kind: "invalid" };
};

export const issueAgentAuthChallenge = async ({
	email,
	claimTokenHash,
	now,
}: {
	email: string;
	claimTokenHash: string;
	now: Date;
}) => {
	const expiresAt = new Date(now.getTime() + AGENT_AUTH_CHALLENGE_TTL_MS);
	const authContext = await auth.$context;
	const challenge: AgentAuthChallenge = {
		version: 1,
		purpose: AgentAuthPurpose.Claim,
		email,
		claimTokenHash,
		expiresAt: expiresAt.toISOString(),
		attempts: 0,
	};

	await deleteAgentChallenge({ authContext, email }).catch(() => undefined);
	await createAgentChallenge({ authContext, email, challenge });
	try {
		await auth.api.sendVerificationOTP({
			body: { email, type: "sign-in" },
		});
	} catch (error) {
		await deleteAgentChallenge({ authContext, email }).catch(() => undefined);
		throw error;
	}

	return { expiresAt };
};
