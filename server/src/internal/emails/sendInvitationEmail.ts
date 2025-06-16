import { sendTextEmail } from "@/external/resend/resendUtils.js";
import { safeResend } from "@/external/resend/safeResend.js";

const getInvitationEmailBody = ({
  orgName,
  inviteLink,
}: {
  orgName: string;
  inviteLink: string;
}) => {
  return `Hey there! You've been invited to join ${orgName} on Autumn. 

Click the link below to create an account / sign in and you'll be automatically added to the organization.

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
    inviteLink: string;
  }) => {
    console.log("Sending invitation email to", email);
    await sendTextEmail({
      from: `Autumn`,
      fromEmail: "hey",
      to: email,
      subject: `Join ${orgName} on Autumn`,
      body: getInvitationEmailBody({ orgName, inviteLink }),
    });
  },
  action: "send org invitation email",
});
