import SidebarBottom from "./SidebarBottom";
import { NavButton } from "./NavButton";
import { useEnv } from "@/utils/envUtils";
import { cn } from "@/lib/utils";
import { useSidebarContext } from "./SidebarContext";
import { useHotkeys } from "react-hotkeys-hook";
import {
  ChartBar,
  Code,
  Package,
  PanelLeft,
  PanelRight,
  Shield,
  User,
} from "lucide-react";
import { EnvDropdown } from "./EnvDropdown";
import { OrgDropdown } from "./components/OrgDropdown";
import { AdminOnly } from "../admin/components/AdminOnly";
import { Button } from "@/components/ui/button";

export const MainSidebar = () => {
  const env = useEnv();
  const { state, setState } = useSidebarContext();

  useHotkeys(["meta+b", "ctrl+b"], () => {
    setState((prev: "expanded" | "collapsed") =>
      prev == "expanded" ? "collapsed" : "expanded",
    );
  });

  return (
    <div
      className={cn(
        `h-full bg-stone-100 py-4 flex flex-col justify-between transition-all duration-150`,
        state == "expanded"
          ? "min-w-[200px] max-w-[200px]"
          : "min-w-[50px] max-w-[50px]",
      )}
    >
      <div className="flex flex-col gap-6 relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setState(state === "expanded" ? "collapsed" : "expanded");
          }}
          className={cn(
            "absolute top-1 right-4 text-t3 hover:bg-stone-200 w-5 h-5 p-0 border-none border-0 shadow-none bg-transparent",
            state == "expanded"
              ? "opacity-100 transition-opacity duration-100"
              : "opacity-0 transition-opacity duration-100",
            // state == "expanded" ? "top-4" : "top-2",
          )}
        >
          <PanelLeft size={14} />
          {/* {state === "expanded" ? (
          ) : (
            <PanelRight size={14} />
          )} */}
        </Button>
        <OrgDropdown />

        <EnvDropdown env={env} />
        <div className="flex flex-col px-4">
          <NavButton
            value="products"
            icon={<Package size={14} />}
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
            value="analytics"
            icon={<ChartBar size={20} />}
            title="Analytics"
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
  );
};
