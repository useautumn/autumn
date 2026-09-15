import type { Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	consumeAgentClaimAttempt,
	deleteAgentClaimAttemptPointer,
} from "../repos/agentChallengeRepo.js";
import {
	claimPendingAgentOrg,
	updateAgentSessionOrg,
} from "../repos/agentOrgRepo.js";

export type CommittedAgentAuthEffects = {
	organization: Organization;
};

export const commitAgentAuthEffects = async ({
	db,
	attemptTokenHash,
	sessionToken,
	userId,
	now,
}: {
	db: DrizzleCli;
	attemptTokenHash: string;
	sessionToken: string;
	userId: string;
	now: Date;
}): Promise<CommittedAgentAuthEffects | null> => {
	return db.transaction(async (tx) => {
		const transactionDb = tx as unknown as DrizzleCli;
		const consumedAttempt = await consumeAgentClaimAttempt({
			db: transactionDb,
			attemptTokenHash,
		});
		if (!consumedAttempt) return null;

		const organization = await claimPendingAgentOrg({
			db: transactionDb,
			claimTokenHash: consumedAttempt.claimTokenHash,
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
		await deleteAgentClaimAttemptPointer({
			db: transactionDb,
			claimTokenHash: consumedAttempt.claimTokenHash,
		});

		return { organization };
	});
};
