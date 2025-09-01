"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import { AppEnv } from "@autumn/shared";
import { envToPath } from "@/utils/genUtils";

import { useLocation } from "react-router";
import { useSidebarContext } from "./SidebarContext";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useState } from "react";
import { ExpandedEnvTrigger } from "./env-dropdown/ExpandedEnvTrigger";

export const EnvDropdown = ({ env }: { env: AppEnv }) => {
  const location = useLocation();

  const handleEnvChange = async (env: AppEnv) => {
    const newPath = envToPath(env, location.pathname);
    if (newPath) {
      const params = new URLSearchParams(location.search);
      const tab = params.get("tab");
      const url = tab ? `${newPath}?tab=${encodeURIComponent(tab)}` : newPath;
      window.location.href = url;
    }
  };

  const [isHovered, setIsHovered] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn("flex text-t2 text-xs gap-1 px-3")}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <ExpandedEnvTrigger isHovered={isHovered} />

        <DropdownMenuContent side="bottom" align="start" className="w-[180px]">
          <DropdownMenuItem
            className="flex justify-between items-center text-t2"
            onClick={() => {
              handleEnvChange(AppEnv.Sandbox);
            }}
          >
            <span>Sandbox</span>
            {env === AppEnv.Sandbox && (
              <Check size={12} className="!h-4 text-t3" />
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            className="flex justify-between items-center text-t2"
            onClick={() => {
              handleEnvChange(AppEnv.Live);
            }}
          >
            <span>Production</span>
            {env === AppEnv.Live && (
              <Check size={12} className="!h-4 text-t3" />
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
