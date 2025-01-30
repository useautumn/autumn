import { ClerkClient } from "@clerk/express";
import { sendTextEmail } from "../resend/resendUtils.js";

const getWelcomeEmailBody = (userFirstName: string) => {
  return `Hey ${userFirstName}!
  
Noticed you signed up for Autumn :) 

Out of curiosity, are you just looking around or do you have a specific use case in mind?

John
Co-founder, Autumn
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
    await sendTextEmail({
      to: email,
      subject: "Anything I can help with?",
      body: getWelcomeEmailBody(user.firstName ?? "there"),
    });

    break;
  }
};
