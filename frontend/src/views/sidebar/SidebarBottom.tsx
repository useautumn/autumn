"use client";

import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { UserButton, useUser } from "@clerk/nextjs";

import { Avatar } from "@nextui-org/react";
import { AppEnv } from "@autumn/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook, faCircleNodes } from "@fortawesome/pro-duotone-svg-icons";

import { TabButton } from "./TabButton";
import { cn } from "@/lib/utils";
import { SidebarContact } from "./SidebarContact";

export default function SidebarBottom({
  userName,
  userEmail,
  env,
}: {
  userName: string;
  userEmail: string;
  env: AppEnv;
}) {
  const { user, isLoaded } = useUser();
  const { state } = useSidebar();
  const expanded = state == "expanded";
  return (
    <SidebarFooter>
      <SidebarMenu className={cn(expanded)}>
        <TabButton
          value="integrations/stripe"
          icon={<FontAwesomeIcon icon={faCircleNodes} />}
          title="Connect to Stripe"
          env={env}
        />
        <TabButton
          value="docs"
          icon={<FontAwesomeIcon icon={faBook} />}
          title="Documentation"
          env={env}
          href="https://docs.useautumn.com"
        />
          
        <SidebarContact />

        <SidebarMenuItem>
          <div className="flex items-center gap-2 mb-4 mt-2 p-1">
            <div className="relative w-7 h-7">
              <Avatar
                size="sm"
                fallback={userName[0]}
                className="bg-primary w-7 h-7 text-white"
              />

              {isLoaded && (
                <UserButton
                  appearance={{ elements: { rootBox: "absolute bottom-0" } }}
                />
              )}
            </div>

            {expanded && (
              <div className="text-xs">
                <p className="text-t2">{userName}</p>
                <p className="text-t3">{userEmail}</p>
              </div>
            )}
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
