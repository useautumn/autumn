import OnboardingView from "@/views/onboarding/OnboardingView";
import { auth } from "@clerk/nextjs/server";

async function OnboardingPage() {
  // const onboardingView = await OnboardingView();
  const { sessionClaims } = await auth();
  return <OnboardingView sessionClaims={sessionClaims} />;
}

export default OnboardingPage;
