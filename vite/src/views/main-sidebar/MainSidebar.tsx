import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCode,
  faFileLines,
  faFlag,
  faTag,
  faToggleOff,
  faUser,
  faUsers,
} from "@fortawesome/pro-duotone-svg-icons";

import { NavButton } from "./NavButton";
import { SidebarTop } from "./SidebarTop";

import { useEnv } from "@/utils/envUtils";
import SidebarBottom from "./SidebarBottom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { SidebarContext } from "./SidebarContext";
import { useHotkeys } from "react-hotkeys-hook";

export const MainSidebar = () => {
  const env = useEnv();
  const [state, setState] = useState<"expanded" | "collapsed">("expanded");

  useHotkeys(["meta+b", "ctrl+b"], () => {
    setState((prev) => (prev == "expanded" ? "collapsed" : "expanded"));
  });

  return (
    <SidebarContext.Provider value={{ state, setState }}>
      <div
        className={cn(
          `h-full bg-zinc-100 py-4 flex flex-col justify-between transition-all duration-150`,
          state == "expanded"
            ? "min-w-[200px] max-w-[200px]"
            : "min-w-[50px] max-w-[50px]"
        )}
      >
        <div>
          <SidebarTop />
          <div className="flex flex-col mt-4 px-4">
            <NavButton
              value="features"
              icon={faFlag}
              title="Features"
              env={env}
            />
            <NavButton
              value="products"
              icon={faTag}
              title="Products"
              env={env}
            />
            <NavButton
              value="customers"
              icon={faUser}
              title="Customers"
              env={env}
            />
            <NavButton value="dev" icon={faCode} title="Developer" env={env} />
          </div>
        </div>
        {/* Sidebar bottom */}
        <SidebarBottom />
      </div>
    </SidebarContext.Provider>
  );
};
