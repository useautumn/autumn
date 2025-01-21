"use client";

import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import { Check, ChevronDown } from "lucide-react";
import { AppEnv } from "@autumn/shared";
import { usePathname } from "next/navigation";
import { envToPath } from "@/utils/genUtils";

export const EnvDropdown = ({ env }: { env: AppEnv }) => {
  const path = usePathname();
  const { state } = useSidebar();
  const expanded = state == "expanded";

  const handleEnvChange = async (env: AppEnv) => {
    const newPath = envToPath(env, path);
    if (newPath) {
      window.location.href = newPath;
    }
  };

  const envText = env === AppEnv.Sandbox ? "Sandbox" : "Production";

  return (
    <SidebarMenuItem>
      <div className="flex text-t2 text-xs flex gap-1 mb-4">
        <DropdownMenu>
          {expanded ? (
            <DropdownMenuTrigger
              asChild
              className="ring-0 focus:ring-0 border bg-white text-t2 rounded-lg"
            >
              <SidebarMenuButton>
                {envText}
                <ChevronDown className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
          ) : (
            <DropdownMenuTrigger>
              <SidebarMenuButton className="flex items-center justify-center bg-white border">
                {envText.slice(0, 1)}
              </SidebarMenuButton>
            </DropdownMenuTrigger>
          )}
          <DropdownMenuContent
            side="top"
            className="w-[--radix-popper-anchor-width]"
          >
            <DropdownMenuItem
              className="flex justify-between items-center"
              onClick={() => {
                handleEnvChange(AppEnv.Sandbox);
              }}
            >
              <span>Sandbox</span>
              {env === AppEnv.Sandbox && (
                <Check className="text-t3" size={13} />
              )}
            </DropdownMenuItem>

            <DropdownMenuItem
              className="flex justify-between items-center"
              onClick={() => {
                handleEnvChange(AppEnv.Live);
              }}
            >
              <span>Production</span>
              {env === AppEnv.Live && <Check className="text-t3" size={13} />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarMenuItem>
  );
};
