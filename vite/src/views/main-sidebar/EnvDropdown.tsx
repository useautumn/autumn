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
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Sailboat,
  TestTube,
} from "lucide-react";
import { useState } from "react";

export const EnvDropdown = ({ env }: { env: AppEnv }) => {
  const location = useLocation();
  const expanded = true;

  const { state } = useSidebarContext();

  const handleEnvChange = async (env: AppEnv) => {
    const newPath = envToPath(env, location.pathname);
    console.log(newPath);
    if (newPath) {
      window.location.href = newPath;
    }
  };

  let [isHovered, setIsHovered] = useState(false);
  let [open, setOpen] = useState(false);

  const envText = env === AppEnv.Sandbox ? "Sandbox" : "Production";

  return (
    <div
      className="flex text-t2 text-xs gap-1 mt-2 mb-4"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        {expanded ? (
          <DropdownMenuTrigger
            className={cn(
              "ring-0 focus:ring-0 text-t2 rounded-sm w-full flex items-center bg-transparent h-8",
              state != "expanded" &&
                "!w-6 !h-6 p-0 items-center justify-center",
            )}
          >
            {state == "expanded" ? (
              <div
                className={cn(
                  "flex items-center justify-between -ml-1 pl-1 pr-3 h-6 border border-amber-500 rounded-xs bg-amber-100 text-amber-600",
                  env === AppEnv.Live &&
                    "text-primary bg-purple-100 shadow-none border-primary font-medium",
                )}
              >
                <div
                  className={cn(
                    "flex justify-center w-4 h-4 items-center rounded-sm transition-all duration-100",
                    state == "expanded" && "mr-2",
                    isHovered && "translate-x-[-1px]",
                  )}
                >
                  {env === AppEnv.Sandbox ? (
                    <FlaskConical size={14} className="!h-4" />
                  ) : (
                    <Sailboat size={14} className="!h-4" />
                  )}
                </div>
                <p className="text-sm">{envText}</p>
                {/* <ChevronRight
                  className={cn(
                    "ml-2 transition-all duration-100",
                    open && "rotate-90"
                  )}
                  size={14}
                /> */}
              </div>
            ) : (
              <p className="text-sm">{envText.slice(0, 1)}</p>
            )}
          </DropdownMenuTrigger>
        ) : (
          <DropdownMenuTrigger>{envText.slice(0, 1)}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent side="bottom" align="start" className="w-[180px]">
          <DropdownMenuItem
            className="flex justify-between items-center"
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
            className="flex justify-between items-center"
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
