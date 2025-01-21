"use client";

import { SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Avatar, cn } from "@nextui-org/react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppEnv } from "@autumn/shared";

export function SidebarTop({ orgName, env }: { orgName: string; env: AppEnv }) {
  const { state, toggleSidebar } = useSidebar();

  return (
    <SidebarHeader className="px-3 pt-4 mb-2 w-full">
      <div
        className={cn(
          "flex items-center w-full",
          state == "expanded" ? "justify-between" : "justify-center"
        )}
      >
        {state == "expanded" && (
          <div className="flex items-center gap-2 text-sm font-medium">
            <Avatar
              size="sm"
              className="w-6 h-6"
              fallback={orgName[0]}
              radius="md"
            />
            <p>{orgName}</p>
          </div>
        )}

        <Button
          size="sm"
          onClick={toggleSidebar}
          variant="ghost"
          className="p-0 w-5 h-5 text-t3 m-0"
        >
          {state == "expanded" ? <ChevronLeft /> : <ChevronRight />}
        </Button>
      </div>
    </SidebarHeader>
  );
}
