import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { getRedirectUrl, navigateTo } from "@/utils/genUtils";
import LoadingScreen from "@/views/general/LoadingScreen";
import { MainSidebar } from "@/views/main-sidebar/MainSidebar";
import { AppEnv } from "@autumn/shared";
import {
  RedirectToSignIn,
  useOrganizationList,
  useUser,
} from "@clerk/clerk-react";
import { useOrganization } from "@clerk/clerk-react";
import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";

import { usePostHog } from "posthog-js/react";

export function MainLayout() {
  const { isLoaded: isUserLoaded, user } = useUser();
  const { organization: org } = useOrganization();
  const { setActive } = useOrganizationList();
  const env = useEnv();
  const { pathname } = useLocation();
  const posthog = usePostHog();

  useEffect(() => {
    // Identify user
    if (user) {
      let email = user.primaryEmailAddress?.emailAddress;
      if (!email) {
        email = user.emailAddresses[0].emailAddress;
      }

      posthog?.identify(email, {
        email,
        name: user.fullName,
        id: user.id,
      });
    }
  }, [user, posthog]);

  // 1. If not loaded, show loading screen
  if (!isUserLoaded) {
    return (
      <div className="w-screen h-screen flex bg-stone-50">
        <MainSidebar />
        <div className="w-full h-screen flex flex-col overflow-hidden">
          {env === AppEnv.Sandbox && (
            <div className="w-full h-10 bg-primary text-white text-sm flex items-center justify-center">
              <p className="font-medium">You&apos;re in sandbox mode.</p>
            </div>
          )}
          <LoadingScreen />
        </div>
      </div>
    );
  }

  // 2. If no user, redirect to sign in
  if (!user) {
    return <RedirectToSignIn />;
  }

  // 1. If not org, and memberships > 0, set org active
  if (!org && user.organizationMemberships.length > 0 && setActive) {
    setActive({
      organization: user.organizationMemberships[0].organization.id,
    });
  }

  if (!org && !pathname.includes("/onboarding")) {
    return <Navigate to={getRedirectUrl("/onboarding", env)} replace={true} />;
  }

  // 3. If user, but no org, redirect to onboarding

  return (
    <main
      className="w-screen h-screen flex"
      style={{
        backgroundImage: "url('/metal.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "top left",
        backgroundRepeat: "no-repeat",
        backgroundColor: "rgba(255, 255, 255, 0)",
        backgroundBlendMode: "overlay",
      }}
    >
      <Toaster
        position="top-center"
        className="flex justify-center"
        duration={2000}
        toastOptions={{
          unstyled: true,
          classNames: {
            error: `w-[350px] text-red-400 flex items-start
              gap-2 bg-white/70 backdrop-blur-sm border border-red-400 rounded-sm p-2 text-sm shadow-md`,
            success: `w-[350px] text-green-600 flex items-start
              gap-2 bg-white/90 backdrop-blur-sm border border-green-500 rounded-sm p-2 text-sm shadow-md`,
          },
        }}
      />
      <MainSidebar />
      <MainContent />
    </main>
  );
}

const MainContent = () => {
  const env = useEnv();

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden">
      {env === AppEnv.Sandbox && (
        <div className="w-full h-10 bg-primary text-white text-sm flex items-center justify-center">
          <p className="font-medium">You&apos;re in sandbox mode.</p>
        </div>
      )}
      <div
        className={cn(
          "w-full h-full overflow-auto p-6 flex justify-center bg-stone-50"
        )}
      >
        <div className="hidden md:flex w-full h-full max-w-[1048px] flex-col gap-4">
          <Outlet />
        </div>
        <div className="md:hidden w-full h-full flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-sm text-center">
            <h2 className="text-xl font-semibold mb-2">
              Autumn is coming to mobile soon
            </h2>
            <p className="text-gray-600">
              We&apos;re currently designed for larger screens. Come back on
              your desktop?
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
