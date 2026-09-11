import { ErrCode, RecaseError } from "@autumn/shared";
import type { APIError } from "better-auth/api";
import { auth } from "@/utils/auth.js";
import {
	AGENT_AUTH_MAX_ATTEMPTS,
	type AgentAuthChallenge,
	createAgentClaimSessionHeaders,
} from "../../agentAuthUtils.js";
import {
	consumeAgentChallenge,
	rearmAgentChallenge,
} from "../../repos/agentChallengeRepo.js";

type AgentAuthContext = Awaited<typeof auth.$context>;

export const invalidAgentChallenge = (): RecaseError =>
	new RecaseError({
		message: "Verification could not be completed",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});

const temporarilyUnavailable = (): RecaseError =>
	new RecaseError({
		message: "Verification is temporarily unavailable",
		code: ErrCode.RequestTemporarilyDisabled,
		statusCode: 503,
	});

const isInvalidOtpError = (error: unknown): boolean => {
	const candidate = error as Partial<APIError>;
	return (
		candidate?.body?.code === "INVALID_OTP" ||
		candidate?.body?.code === "OTP_EXPIRED" ||
		candidate?.body?.code === "TOO_MANY_ATTEMPTS"
	);
};

const isRetryableInvalidOtpError = (error: unknown): boolean =>
	(error as Partial<APIError>)?.body?.code === "INVALID_OTP";

export const toAgentVerifyError = (error: unknown): RecaseError => {
	if (error instanceof RecaseError) return error;
	if (isInvalidOtpError(error)) return invalidAgentChallenge();
	return temporarilyUnavailable();
};

export const takeAgentChallenge = async ({ email }: { email: string }) => {
	const authContext = await auth.$context.catch(() => {
		throw temporarilyUnavailable();
	});
	const challenge = await consumeAgentChallenge({
		authContext,
		email,
	}).catch(() => {
		throw temporarilyUnavailable();
	});

	return { authContext, challenge };
};

export const signInAgentEmailOtp = async ({
	challenge,
	otp,
}: {
	challenge: AgentAuthChallenge;
	otp: string;
}) =>
	auth.api.signInEmailOTP({
		body: {
			email: challenge.email,
			otp,
		},
		headers: createAgentClaimSessionHeaders(),
	});

export const discardAgentSignInSession = async ({
	authContext,
	sessionToken,
}: {
	authContext: AgentAuthContext;
	sessionToken: string;
}) => {
	await authContext.internalAdapter
		.deleteSession(sessionToken)
		.catch(() => undefined);
};

export const rearmAgentChallengeIfRetryable = async ({
	authContext,
	email,
	challenge,
	error,
	now,
}: {
	authContext: AgentAuthContext;
	email: string;
	challenge: AgentAuthChallenge;
	error: unknown;
	now: Date;
}) => {
	const hasAttemptsRemaining = challenge.attempts + 1 < AGENT_AUTH_MAX_ATTEMPTS;
	const challengeIsLive = new Date(challenge.expiresAt) > now;
	const retryable =
		isRetryableInvalidOtpError(error) &&
		hasAttemptsRemaining &&
		challengeIsLive;

	if (!retryable) return;

	await rearmAgentChallenge({
		authContext,
		email,
		challenge,
	}).catch(() => {
		throw temporarilyUnavailable();
	});
};
