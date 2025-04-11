import { NavButton } from "./NavButton";
import { SidebarTop } from "./SidebarTop";

import { useEnv } from "@/utils/envUtils";
import SidebarBottom from "./SidebarBottom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { SidebarContext } from "./SidebarContext";
import { useHotkeys } from "react-hotkeys-hook";
import { Code, Flag, Tag, User } from "lucide-react";

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
          `h-full bg-stone-100 py-4 flex flex-col justify-between transition-all duration-150`,
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
              icon={<Flag size={15} />}
              title="Features"
              env={env}
            />
            <NavButton
              value="products"
              icon={<Tag size={14} />}
              title="Products"
              env={env}
            />
            <NavButton
              value="customers"
              icon={<User size={20} />}
              title="Customers"
              env={env}
            />
            <NavButton
              value="dev"
              icon={<Code size={15} />}
              title="Developer"
              env={env}
            />
          </div>
        </div>
        {/* Sidebar bottom */}
        <SidebarBottom />
      </div>
    </SidebarContext.Provider>
  );
};
