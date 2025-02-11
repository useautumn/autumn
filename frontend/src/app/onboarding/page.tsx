import OnboardingView from "@/views/onboarding/OnboardingView";
import { AppEnv } from "@autumn/shared";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";

async function OnboardingPage() {
  // const onboardingView = await OnboardingView();

  const headersList = await headers();
  const env = (headersList.get("env") as AppEnv) || AppEnv.Sandbox;

  const { sessionClaims } = await auth();
  return <OnboardingView sessionClaims={sessionClaims} env={env} />;
}

export default OnboardingPage;
