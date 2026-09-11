import type { Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AgentAuthChallenge } from "../agentAuthUtils.js";
import {
	claimPendingAgentOrg,
	updateAgentSessionOrg,
} from "../repos/agentOrgRepo.js";

export type CommittedAgentAuthEffects = {
	organization: Organization;
};

export const commitAgentAuthEffects = async ({
	db,
	challenge,
	sessionToken,
	userId,
	now,
}: {
	db: DrizzleCli;
	challenge: AgentAuthChallenge;
	sessionToken: string;
	userId: string;
	now: Date;
}): Promise<CommittedAgentAuthEffects | null> => {
	if (!challenge.claimTokenHash) return null;

	return db.transaction(async (tx) => {
		const transactionDb = tx as unknown as DrizzleCli;
		const organization = await claimPendingAgentOrg({
			db: transactionDb,
			claimTokenHash: challenge.claimTokenHash!,
			userId,
			now,
		});
		if (!organization) return null;

		const sessionUpdated = await updateAgentSessionOrg({
			db: transactionDb,
			sessionToken,
			organizationId: organization.id,
		});
		if (!sessionUpdated) throw new Error("Agent session update failed");

		return { organization };
	});
};
