import { z } from "zod/v4";
import {
	type AgentAuthChallenge,
	AgentAuthPurpose,
	getAgentChallengeIdentifier,
} from "../agentAuthUtils.js";

type AgentChallengeAuthContext = {
	internalAdapter: {
		createVerificationValue: (data: {
			identifier: string;
			value: string;
			expiresAt: Date;
		}) => Promise<unknown>;
		consumeVerificationValue: (
			identifier: string,
		) => Promise<{ value: string } | null>;
		deleteVerificationByIdentifier: (identifier: string) => Promise<void>;
	};
};

const AgentAuthChallengeSchema = z.object({
	version: z.literal(1),
	purpose: z.literal(AgentAuthPurpose.Claim),
	email: z.email(),
	claimTokenHash: z.string().length(64).optional(),
	expiresAt: z.iso.datetime(),
	attempts: z.number().int().nonnegative(),
});

export const parseAgentAuthChallenge = ({
	value,
}: {
	value: string;
}): AgentAuthChallenge | null => {
	try {
		const parsed = AgentAuthChallengeSchema.safeParse(JSON.parse(value));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
};

export const createAgentChallenge = async ({
	authContext,
	email,
	challenge,
}: {
	authContext: AgentChallengeAuthContext;
	email: string;
	challenge: AgentAuthChallenge;
}) =>
	authContext.internalAdapter.createVerificationValue({
		identifier: getAgentChallengeIdentifier({ email }),
		value: JSON.stringify(challenge),
		expiresAt: new Date(challenge.expiresAt),
	});

export const consumeAgentChallenge = async ({
	authContext,
	email,
}: {
	authContext: AgentChallengeAuthContext;
	email: string;
}): Promise<AgentAuthChallenge | null> => {
	const verification =
		await authContext.internalAdapter.consumeVerificationValue(
			getAgentChallengeIdentifier({ email }),
		);
	if (!verification) return null;

	return parseAgentAuthChallenge({ value: verification.value });
};

export const deleteAgentChallenge = async ({
	authContext,
	email,
}: {
	authContext: AgentChallengeAuthContext;
	email: string;
}) =>
	authContext.internalAdapter.deleteVerificationByIdentifier(
		getAgentChallengeIdentifier({ email }),
	);

export const rearmAgentChallenge = async ({
	authContext,
	email,
	challenge,
}: {
	authContext: AgentChallengeAuthContext;
	email: string;
	challenge: AgentAuthChallenge;
}) =>
	createAgentChallenge({
		authContext,
		email,
		challenge: { ...challenge, attempts: challenge.attempts + 1 },
	});
