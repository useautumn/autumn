import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OrganizationSwitcher, useUser } from "@clerk/clerk-react";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faCode,
  faFileLines,
  faToggleOff,
  faUsers,
} from "@fortawesome/pro-duotone-svg-icons";

import { AppEnv } from "@autumn/shared";
import { NavButton } from "./NavButton";

export const MainSidebar = () => {
  const [state] = useState<"expanded" | "collapsed">("expanded");
  const { isLoaded, user } = useUser();

  const primaryEmail = user?.primaryEmailAddress?.emailAddress;
  const env = AppEnv.Sandbox;
  return (
    <div className="min-w-[220px] max-w-[220px] h-full bg-zinc-100">
      {/* 1. Org */}

      <div
        className={cn(
          "flex items-center w-full",
          state == "expanded" ? "justify-between" : "justify-center"
        )}
      >
        {state == "expanded" && (
          <div className="flex flex-col">
            <div className="flex relative w-full h-7">
              <OrganizationSwitcher
                appearance={{
                  elements: {
                    organizationSwitcherTrigger: "flex pl-0 pr-1 max-w-[160px]",
                  },
                }}
                hidePersonal={true}
                skipInvitationScreen={true}
                afterCreateOrganizationUrl="/sandbox/customers"
              />
              {isLoaded &&
                (primaryEmail === "johnyeocx@gmail.com" ||
                  primaryEmail === "ayush@recaseai.com" ||
                  primaryEmail == "johnyeo10@gmail.com") && (
                  <div className="text-xs text-gray-500 ml-2 flex items-center gap-1">
                    {/* <span className="w-[70px] overflow-hidden text-ellipsis whitespace-nowrap">
                      {organization?.id}
                    </span> */}
                    {/* <CopyButton text={organization?.id || ""} /> */}
                  </div>
                )}
            </div>
          </div>
        )}

        <Button
          size="sm"
          onClick={() => {}}
          variant="ghost"
          className="p-0 w-5 h-5 text-t3 m-0"
        >
          <FontAwesomeIcon icon={faChevronRight} />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-t3">Hello Test</p>
        <NavButton
          value="features"
          icon={<FontAwesomeIcon icon={faToggleOff} />}
          title="Features"
          env={env}
        />

        <NavButton
          value="products"
          icon={<FontAwesomeIcon icon={faFileLines} />}
          title="Products"
          env={env}
        />
        <NavButton
          value="customers"
          icon={<FontAwesomeIcon icon={faUsers} />}
          title="Customers"
          env={env}
        />
        <NavButton
          value="dev"
          icon={<FontAwesomeIcon icon={faCode} />}
          title="Developer"
          env={env}
        />
      </div>
    </div>
  );
};
