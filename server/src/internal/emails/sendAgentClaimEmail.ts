import { logger } from "@/external/logtail/logtailUtils.js";
import { createResendCli } from "@/external/resend/resendUtils.js";
import { safeResend } from "@/external/resend/safeResend.js";
import AgentClaimEmail from "./AgentClaimEmail.js";
import { FROM_AUTUMN } from "./constants.js";

export const sendAgentClaimEmail = safeResend({
	fn: async ({
		email,
		organizationName,
		claimUrl,
		expiresAt,
	}: {
		email: string;
		organizationName: string;
		claimUrl: string;
		expiresAt: Date;
	}) => {
		logger.info(`Sending agent claim email to ${email}`);
		const resend = createResendCli();
		const { error } = await resend.emails.send({
			from: FROM_AUTUMN,
			to: email,
			subject: `Claim ${organizationName} on Autumn`,
			react: AgentClaimEmail({ organizationName, claimUrl, expiresAt }),
		});
		if (error) throw error;
	},
	action: "send agent claim email",
});
