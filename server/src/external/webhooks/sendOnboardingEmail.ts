import { ClerkClient } from "@clerk/express";
import { sendHtmlEmail, sendTextEmail } from "../resend/resendUtils.js";

const getWelcomeEmailBody = (userFirstName: string) => {
  return `
<p>Hey ${userFirstName} :)</p>

<p>Just wanted to say thank you for signing up to Autumn!</p>

<p>I'm curious--how did you hear about us? Also are you just looking around or do you have a specific use case I can help you with?</p>

<p>Whatever the reason, anything you need I'm here to help.</p>

<p>Ayush<br>
Co-founder, Autumn</p>

<p>Oh, and join our <a href="https://discord.gg/PMNwStsk">Discord community</a> to connect with us and other users</p>
  `;
};

export const sendOnboardingEmail = async ({
  orgId,
  clerkCli,
}: {
  orgId: string;
  clerkCli: ClerkClient;
}) => {
  const memberships =
    await clerkCli.organizations.getOrganizationMembershipList({
      organizationId: orgId,
    });

  for (let membership of memberships.data) {
    if (!membership.publicUserData) break;

    const user = await clerkCli.users.getUser(membership.publicUserData.userId);
    const email = user.primaryEmailAddress?.emailAddress;

    if (!email) break;

    console.log("Sending onboarding email to", email);
    await sendHtmlEmail({
      to: email,
      subject: "Anything I can help with?",
      body: getWelcomeEmailBody(user.firstName ?? "there"),
    });

    break;
  }
};
