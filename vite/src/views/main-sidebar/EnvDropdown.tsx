"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import { AppEnv } from "@autumn/shared";
import { envToPath } from "@/utils/genUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown } from "@fortawesome/pro-regular-svg-icons";
import { useLocation } from "react-router";
import { useSidebarContext } from "./SidebarContext";
import { cn } from "@/lib/utils";

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

  const envText = env === AppEnv.Sandbox ? "Sandbox" : "Production";

  return (
    <div className="flex text-t2 text-xs flex gap-1 mt-4 px-1">
      <DropdownMenu>
        {expanded ? (
          <DropdownMenuTrigger
            className={cn(
              "ring-0 focus:ring-0 border bg-white text-t2 rounded-sm w-full flex items-center p-2 h-8",
              state != "expanded" && "!w-6 !h-6 p-0 items-center justify-center"
            )}
          >
            {state == "expanded" ? (
              <div className="flex items-center justify-between w-full gap-1">
                <p className="text-sm">{envText}</p>
                <FontAwesomeIcon icon={faChevronDown} className="ml-auto" />
              </div>
            ) : (
              <p className="text-sm">{envText.slice(0, 1)}</p>
            )}
          </DropdownMenuTrigger>
        ) : (
          <DropdownMenuTrigger>{envText.slice(0, 1)}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent side="top" className="w-[200px]">
          <DropdownMenuItem
            className="flex justify-between items-center"
            onClick={() => {
              handleEnvChange(AppEnv.Sandbox);
            }}
          >
            <span>Sandbox</span>
            {env === AppEnv.Sandbox && (
              <FontAwesomeIcon icon={faCheck} className="text-t3" />
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
              <FontAwesomeIcon icon={faCheck} className="text-t3" />
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
