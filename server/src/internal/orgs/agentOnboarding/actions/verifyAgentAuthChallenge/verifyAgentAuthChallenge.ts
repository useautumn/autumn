import type { DrizzleCli } from "@/db/initDrizzle.js";
import { normalizeAgentEmail } from "../../agentAuthUtils.js";
import { commitAgentAuthEffects } from "../commitAgentAuthEffects.js";
import {
	discardAgentSignInSession,
	invalidAgentChallenge,
	rearmAgentChallengeIfRetryable,
	signInAgentEmailOtp,
	takeAgentChallenge,
	toAgentVerifyError,
} from "./verifyAgentAuthChallengeUtils.js";

export const verifyAgentAuthChallenge = async ({
	db,
	email,
	otp,
	now = new Date(),
}: {
	db: DrizzleCli;
	email: string;
	otp: string;
	now?: Date;
}) => {
	const normalizedEmail = normalizeAgentEmail({ email });
	const { authContext, challenge } = await takeAgentChallenge({
		email: normalizedEmail,
	});
	if (!challenge) throw invalidAgentChallenge();

	try {
		const signedIn = await signInAgentEmailOtp({ challenge, otp });
		try {
			const committed = await commitAgentAuthEffects({
				db,
				challenge,
				sessionToken: signedIn.token,
				userId: signedIn.user.id,
				now,
			});
			if (!committed) throw invalidAgentChallenge();

			return {
				organization: committed.organization,
				user: signedIn.user,
			};
		} catch (error) {
			await discardAgentSignInSession({
				authContext,
				sessionToken: signedIn.token,
			});
			throw toAgentVerifyError(error);
		}
	} catch (error) {
		await rearmAgentChallengeIfRetryable({
			authContext,
			email: normalizedEmail,
			challenge,
			error,
			now,
		});
		throw toAgentVerifyError(error);
	}
};
