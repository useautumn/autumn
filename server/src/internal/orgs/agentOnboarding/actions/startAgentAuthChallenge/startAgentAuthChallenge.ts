import type { DrizzleCli } from "@/db/initDrizzle.js";
import { normalizeAgentEmail } from "../../agentAuthUtils.js";
import {
	issueAgentAuthChallenge,
	resolveClaimIdentity,
} from "./startAgentAuthChallengeUtils.js";

export const startAgentAuthChallenge = async ({
	db,
	email,
	claimToken,
	setupKey,
	now = new Date(),
}: {
	db: DrizzleCli;
	email: string;
	claimToken?: string;
	setupKey?: string;
	now?: Date;
}) => {
	const normalizedEmail = normalizeAgentEmail({ email });
	const identity = await resolveClaimIdentity({
		db,
		claimToken,
		setupKey,
		now,
	});
	if (identity.kind === "invalid") return null;

	return issueAgentAuthChallenge({
		email: normalizedEmail,
		claimTokenHash: identity.claimTokenHash,
		now,
	});
};
