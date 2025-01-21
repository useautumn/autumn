import OnboardingView from "@/views/onboarding/OnboardingView";

async function OnboardingPage() {
  const onboardingView = await OnboardingView();
  return onboardingView;
}

export default OnboardingPage;
