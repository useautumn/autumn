import { cn } from "@/lib/utils";
import {
  OrganizationSwitcher,
  useOrganization,
  useUser,
} from "@clerk/clerk-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/pro-regular-svg-icons";
import CopyButton from "@/components/general/CopyButton";
import { EnvDropdown } from "./EnvDropdown";

import { useEnv } from "@/utils/envUtils";
import { useSidebarContext } from "./SidebarContext";

export const SidebarTop = () => {
  const { isLoaded, user } = useUser();
  const { state, setState } = useSidebarContext();
  const primaryEmail = user?.primaryEmailAddress?.emailAddress;
  const env = useEnv();
  const { organization } = useOrganization();
  const prevOrgIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip the first render
    if (prevOrgIdRef.current === null) {
      prevOrgIdRef.current = organization?.id || null;
      return;
    }

    // If organization changed (switched or created/deleted)
    if (prevOrgIdRef.current !== (organization?.id || null)) {
      console.log("Organization changed, refreshing page");
      window.location.reload();
    }

    // Update the ref
    prevOrgIdRef.current = organization?.id || null;
  }, [organization]);

  return (
    <div className="px-2">
      <div
        className={cn(
          "flex items-center w-full",
          state == "expanded" ? "justify-between" : "justify-center"
        )}
      >
        {state == "expanded" && (
          <div className="flex flex-col">
            <div className="flex relative w-full h-7">
              {organization && (
                <OrganizationSwitcher
                  appearance={{
                    elements: {
                      organizationSwitcherTrigger:
                        "flex !pl- pr-1 max-w-[160px]",
                    },
                  }}
                  hidePersonal={true}
                  skipInvitationScreen={true}
                  afterCreateOrganizationUrl="/sandbox/onboarding"
                />
              )}
              {isLoaded &&
                organization &&
                (primaryEmail === "johnyeocx@gmail.com" ||
                  primaryEmail === "ayush@recaseai.com" ||
                  primaryEmail == "johnyeo10@gmail.com") && (
                  <div className="text-xs text-gray-500 ml-2 flex items-center gap-1">
                    <CopyButton text={organization?.id || ""} />
                  </div>
                )}
            </div>
          </div>
        )}
        <Button
          size="sm"
          onClick={() => {
            setState((prev: string) =>
              prev == "expanded" ? "collapsed" : "expanded"
            );
          }}
          variant="ghost"
          className="p-0 w-5 h-5 text-t3 m-0"
        >
          <FontAwesomeIcon
            icon={state == "expanded" ? faChevronLeft : faChevronRight}
          />
        </Button>
      </div>
      <EnvDropdown env={env} />
    </div>
  );
};
