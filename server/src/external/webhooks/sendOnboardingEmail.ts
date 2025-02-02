import { ClerkClient } from "@clerk/express";
import { sendTextEmail } from "../resend/resendUtils.js";

const getWelcomeEmailBody = (userFirstName: string) => {
  return `hey ${userFirstName} :)
  
Just wanted to say thank you for signing up to Autumn! 

We're super early, so I'm curious--how did you hear about us? Also are you just looking around or do you have a specific use case I can help you with? 

We want to become the easiest way to manage software pricing, so any feedback you have for us is incredibly appreciated.

Ayush
Co-founder, Autumn

Book a call with me here: https://cal.com/ayrod
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
