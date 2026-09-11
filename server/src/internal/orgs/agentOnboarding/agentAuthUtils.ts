import crypto from "node:crypto";

export const AGENT_AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const AGENT_AUTH_MAX_ATTEMPTS = 3;

export const AgentAuthPurpose = {
	Claim: "claim",
} as const;

export type AgentAuthPurpose =
	(typeof AgentAuthPurpose)[keyof typeof AgentAuthPurpose];

export type AgentAuthChallenge = {
	version: 1;
	purpose: AgentAuthPurpose;
	email: string;
	claimTokenHash?: string;
	expiresAt: string;
	attempts: number;
};

export const normalizeAgentEmail = ({ email }: { email: string }): string =>
	email.trim().toLowerCase();

export const hashAgentAuthSubject = ({ value }: { value: string }): string =>
	crypto.createHash("sha256").update(value).digest("hex");

export const getAgentChallengeIdentifier = ({
	email,
}: {
	email: string;
}): string => `agent-challenge:${hashAgentAuthSubject({ value: email })}`;

export const hashAgentClaimToken = ({
	claimToken,
}: {
	claimToken: string;
}): string => hashAgentAuthSubject({ value: claimToken });

const AGENT_CLAIM_HEADER = "x-autumn-agent-claim";
const agentClaimMarker = crypto.randomBytes(32).toString("base64url");

export const createAgentClaimSessionHeaders = (): Headers => {
	const headers = new Headers();
	headers.set(AGENT_CLAIM_HEADER, agentClaimMarker);
	return headers;
};

export const shouldSkipDefaultOrgForAgentClaim = ({
	headers,
}: {
	headers: HeadersInit | undefined;
}): boolean => {
	const marker = new Headers(headers).get(AGENT_CLAIM_HEADER);
	if (!marker || marker.length !== agentClaimMarker.length) return false;

	return crypto.timingSafeEqual(
		Buffer.from(marker),
		Buffer.from(agentClaimMarker),
	);
};
