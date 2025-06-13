import { sendTextEmail } from "@/external/resend/resendUtils.js";

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

export const sendInvitationEmail = async ({
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
    to: email,
    subject: `Join ${orgName} on Autumn`,
    body: getInvitationEmailBody({ orgName, inviteLink }),
  });
};
