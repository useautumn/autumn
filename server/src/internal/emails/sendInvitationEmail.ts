import { logger } from "@/external/logtail/logtailUtils.js";
import { sendTextEmail } from "@/external/resend/resendUtils.js";
import { safeResend } from "@/external/resend/safeResend.js";

const getInvitationEmailBody = ({ orgName }: { orgName: string }) => {
  return `Hey there! You've been invited to join ${orgName} on Autumn. 

Click the link below to create an account / sign in to Autumn and accept the invitation.

${process.env.CLIENT_URL}/sign-in
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
    inviteLink?: string;
  }) => {
    logger.info(`Sending invitation email to ${email}`);
    await sendTextEmail({
      from: `Autumn`,
      fromEmail: "hey",
      to: email,
      subject: `Join ${orgName} on Autumn`,
      body: getInvitationEmailBody({ orgName }),
    });
  },
  action: "send org invitation email",
});
