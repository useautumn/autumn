import { logger } from "@/external/logtail/logtailUtils.js";
import { sendTextEmail } from "@/external/resend/resendUtils.js";
import { safeResend } from "@/external/resend/safeResend.js";
import { FROM_AUTUMN } from "./constants.js";

const getInvitationEmailBody = ({
	orgName,
	inviteLink,
}: {
	orgName: string;
	inviteLink: string;
}) => {
	return `Hey there! You've been invited to join ${orgName} on Autumn.

Click the link below to create an account / sign in to Autumn and accept the invitation. This invitation expires in 7 days.

${inviteLink}
  `;
};

export const sendInvitationEmail = safeResend({
	fn: async ({
		email,
		orgName,
		inviteLink,
	}: {
		email: string;
		orgName: string;
		inviteLink: string;
	}) => {
		logger.info(`Sending invitation email to ${email}`);
		await sendTextEmail({
			from: FROM_AUTUMN,
			to: email,
			subject: `Join ${orgName} on Autumn`,
			body: getInvitationEmailBody({ orgName, inviteLink }),
		});
	},
	action: "send org invitation email",
});
