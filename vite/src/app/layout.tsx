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
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";

import { usePostHog } from "posthog-js/react";
import { Button } from "@/components/ui/button";
import { ArrowUpRightFromSquare } from "lucide-react";
import { AutumnProvider } from "autumn-js/react";
import { useAuth } from "@clerk/clerk-react";

export function MainLayout() {
  const { isLoaded: isUserLoaded, user } = useUser();
  const { organization: org } = useOrganization();
  const { setActive } = useOrganizationList();
  const { getToken } = useAuth();
  const env = useEnv();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const posthog = usePostHog();

  useEffect(() => {
    // Identify user
    if (user && process.env.NODE_ENV !== "development") {
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
      <div className="w-screen h-screen flex bg-stone-100">
        <MainSidebar />
        <div className="w-full h-screen flex flex-col overflow-hidden py-3 pr-3">
          <div className="w-full h-full flex flex-col overflow-hidden rounded-lg border">
            {env === AppEnv.Sandbox && (
              <div className="w-full min-h-10 h-10 bg-amber-100 text-white text-sm flex items-center justify-center relative px-4">
                <p className="font-medium text-amber-500 font-mono">
                  You&apos;re in sandbox
                </p>
                <Button
                  variant="default"
                  className="h-6 border border-amber-500 bg-transparent text-amber-500 hover:bg-amber-500 hover:text-white font-mono rounded-xs ml-auto absolute right-4"
                  onClick={() => {
                    navigateTo("/onboarding", navigate, AppEnv.Sandbox);
                  }}
                >
                  Onboarding
                  <ArrowUpRightFromSquare size={12} className="inline ml-1" />
                </Button>
              </div>
            )}
            <div className="flex bg-stone-50 flex-col h-full">
              <LoadingScreen />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. If no user, redirect to sign in
  if (!user) {
    return <RedirectToSignIn />;
  }

  // // 1. If not org, and memberships > 0, set org active
  // if (!org && user.organizationMemberships.length > 0 && setActive) {
  //   setActive({
  //     organization: user.organizationMemberships[0].organization.id,
  //   });
  // }

  if (!org && !pathname.includes("/onboarding")) {
    return (
      <Navigate
        to={getRedirectUrl("/onboarding", AppEnv.Sandbox)}
        replace={true}
      />
    );
  }

  return (
    <AutumnProvider
      includeCredentials={false}
      backendUrl={import.meta.env.VITE_BACKEND_URL}
      getBearerToken={async () => {
        const token = await getToken({
          template: "custom_template",
        });
        return token;
      }}
    >
      <main className="w-screen h-screen flex bg-stone-100">
        <Toaster
          position="top-center"
          className="flex justify-center"
          duration={6000}
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
    </AutumnProvider>
  );
}

const MainContent = () => {
  const env = useEnv();
  const navigate = useNavigate();

  return (
    <div className="w-full h-screen flex flex-col justify-center overflow-hidden py-3 pr-3">
      <div className="w-full h-full flex flex-col overflow-hidden rounded-lg border">
        {env === AppEnv.Sandbox && (
          <div className="w-full min-h-10 h-10 bg-amber-100 text-sm flex items-center justify-center relative px-4 text-amber-500 ">
            <p className="font-medium font-mono">You&apos;re in sandbox</p>
            {!window.location.pathname.includes("/onboarding") && (
              <Button
                variant="default"
                className="h-6 border border-amber-500 bg-transparent text-amber-500 hover:bg-amber-500 hover:text-white font-mono rounded-xs ml-auto absolute right-4"
                onClick={() => {
                  navigateTo("/onboarding", navigate, AppEnv.Sandbox);
                }}
              >
                Onboarding
                <ArrowUpRightFromSquare size={12} className="inline ml-1" />
              </Button>
            )}
          </div>
        )}
        <div
          className={cn(
            "w-full h-full overflow-auto flex justify-center bg-stone-50",
          )}
        >
          <div className="hidden md:flex w-full h-full justify-center">
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
    </div>
  );
};
