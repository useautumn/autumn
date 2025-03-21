"use client";

import { UserButton, useUser } from "@clerk/clerk-react";

import { NavButton } from "./NavButton";
import { useEnv } from "@/utils/envUtils";
import { SidebarContact } from "./SidebarContact";
import { useSidebarContext } from "./SidebarContext";
import { cn } from "@/lib/utils";
import { Blocks, Book } from "lucide-react";

export default function SidebarBottom() {
  const env = useEnv();
  const { user, isLoaded } = useUser();
  const { state } = useSidebarContext();
  const expanded = state == "expanded";

  return (
    <div className="">
      <div className="px-4">
        <NavButton
          value="integrations/stripe"
          icon={<Blocks size={14} />}
          title="Connect to Stripe"
          env={env}
        />
        <NavButton
          value="docs"
          icon={<Book size={14} />}
          title="Documentation"
          env={env}
          href="https://docs.useautumn.com"
        />
        <SidebarContact />
      </div>

      <div
        className={cn(
          "flex items-center gap-2 mb-4 mt-6 px-4",
          state != "expanded" && "w-full flex px-0 justify-center"
        )}
      >
        <div className="relative w-7 h-7">
          <UserButton
            appearance={{ elements: { rootBox: "absolute bottom-0" } }}
          />
        </div>
        {expanded && (
          <div className="text-xs">
            <p className="text-t2">{user?.firstName}</p>
            <p className="text-t3">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
        )}
      </div>
    </div>
  );
}
