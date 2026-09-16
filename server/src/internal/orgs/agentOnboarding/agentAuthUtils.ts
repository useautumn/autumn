import crypto from "node:crypto";

export const AGENT_CLAIM_ATTEMPT_TTL_MS = 10 * 60 * 1000;
export const AGENT_CLAIM_INTENT_COOKIE = "autumn_agent_claim";

export const AgentClaimPurpose = {
	Claim: "claim",
} as const;

export type AgentClaimPurpose =
	(typeof AgentClaimPurpose)[keyof typeof AgentClaimPurpose];

export type AgentClaimAttempt = {
	version: 1;
	purpose: AgentClaimPurpose;
	email: string;
	claimTokenHash: string;
	attemptTokenHash: string;
	expiresAt: string;
};

export const normalizeAgentEmail = ({ email }: { email: string }): string =>
	email.trim().toLowerCase();

export const hashAgentAuthSubject = ({ value }: { value: string }): string =>
	crypto.createHash("sha256").update(value).digest("hex");

export const getAgentClaimAttemptIdentifier = ({
	attemptTokenHash,
}: {
	attemptTokenHash: string;
}): string => `agent-claim-attempt:${attemptTokenHash}`;

export const getAgentClaimPointerIdentifier = ({
	claimTokenHash,
}: {
	claimTokenHash: string;
}): string => `agent-claim-pointer:${claimTokenHash}`;

export const hashAgentClaimToken = ({
	claimToken,
}: {
	claimToken: string;
}): string => hashAgentAuthSubject({ value: claimToken });

export const createAgentClaimAttemptToken = (): string =>
	crypto.randomBytes(32).toString("base64url");

export const buildAgentClaimUrl = ({
	attemptToken,
}: {
	attemptToken: string;
}): string => {
	const clientUrl = (process.env.CLIENT_URL ?? "http://localhost:3000").replace(
		/\/$/,
		"",
	);
	return `${clientUrl}/claim?token=${encodeURIComponent(attemptToken)}`;
};

const signAgentClaimIntent = ({ attemptToken }: { attemptToken: string }) =>
	crypto
		.createHmac(
			"sha256",
			process.env.BETTER_AUTH_SECRET ?? "missing-better-auth-secret",
		)
		.update(attemptToken)
		.digest("base64url");

export const createAgentClaimIntent = ({
	attemptToken,
}: {
	attemptToken: string;
}): string => `${attemptToken}.${signAgentClaimIntent({ attemptToken })}`;

export const parseAgentClaimIntent = ({
	value,
}: {
	value: string | undefined;
}): string | null => {
	if (!value) return null;
	const separator = value.lastIndexOf(".");
	if (separator <= 0) return null;
	const attemptToken = value.slice(0, separator);
	const signature = value.slice(separator + 1);
	const expected = signAgentClaimIntent({ attemptToken });
	if (signature.length !== expected.length) return null;
	return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
		? attemptToken
		: null;
};

export const getAgentClaimIntentFromHeaders = ({
	headers,
}: {
	headers: HeadersInit | undefined;
}): string | null => {
	const cookie = new Headers(headers).get("cookie");
	const value = cookie
		?.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${AGENT_CLAIM_INTENT_COOKIE}=`))
		?.slice(AGENT_CLAIM_INTENT_COOKIE.length + 1);
	return parseAgentClaimIntent({
		value: value ? decodeURIComponent(value) : undefined,
	});
};
