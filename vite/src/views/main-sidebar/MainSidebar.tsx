import SidebarBottom from "./SidebarBottom";
import { NavButton } from "./NavButton";
import { useEnv } from "@/utils/envUtils";
import { cn } from "@/lib/utils";
import { SidebarContext } from "./SidebarContext";
import { useHotkeys } from "react-hotkeys-hook";
import {
  ChartBar,
  CircleUserRound,
  Code,
  Package,
  PanelLeft,
  SquareTerminal,
  ChartColumnBig,
} from "lucide-react";
import { EnvDropdown } from "./EnvDropdown";
import { OrgDropdown } from "./components/OrgDropdown";
import { Button } from "@/components/ui/button";

import { SidebarGroup } from "./SidebarGroup";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { Link, useSearchParams } from "react-router";
import { pushPage } from "@/utils/genUtils";

export const MainSidebar = () => {
  const env = useEnv();

  const { webhooks } = useAutumnFlags();

  const [expanded, setExpanded] = useLocalStorage<boolean>(
    "sidebar.expanded",
    true
  );

  const [productGroupOpen, setProductGroupOpen] = useLocalStorage<boolean>(
    "sidebar.productGroupOpen",
    true
  );
  const [devGroupOpen, setDevGroupOpen] = useLocalStorage<boolean>(
    "sidebar.devGroupOpen",
    true
  );

  useHotkeys(["meta+b", "ctrl+b"], () => {
    setExpanded((prev) => !prev);
  });

  const onProductTabClick = () => {
    setProductGroupOpen((prev) => !prev);
  };

  // const expanded = state == "expanded";
  return (
    <SidebarContext.Provider value={{ expanded, setExpanded }}>
      <div
        className={cn(
          `h-full bg-stone-100 py-4 flex flex-col justify-between transition-all duration-150`,
          expanded ? "min-w-[200px] max-w-[200px]" : "min-w-[50px] max-w-[50px]"
        )}
      >
        <div className="flex flex-col gap-6 relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExpanded((prev) => !prev);
            }}
            className={cn(
              "absolute top-1 right-4 text-t3 hover:bg-stone-200 w-5 h-5 p-0 border-none border-0 shadow-none bg-transparent",
              expanded
                ? "opacity-100 transition-opacity duration-100"
                : "opacity-0 transition-opacity duration-100"
            )}
          >
            <PanelLeft size={14} />
          </Button>
          <OrgDropdown />

          <EnvDropdown env={env} />
          <div className="flex flex-col px-2 gap-1">
            <div>
              {expanded ? (
                <>
                  <NavButton
                    value="products"
                    onClick={() => setProductGroupOpen((prev) => !prev)}
                    icon={<Package size={14} />}
                    title="Products"
                    env={env}
                    isOpen={productGroupOpen}
                    isGroup
                  />
                  <SidebarGroup
                    value="products"
                    productGroup={productGroupOpen}
                    subTabs={[
                      { title: "Products", value: "products" },
                      { title: "Features", value: "features" },
                      { title: "Rewards", value: "rewards" },
                    ]}
                  />
                </>
              ) : (
                <div className="relative">
                  <NavButton
                    value="products"
                    icon={<Package size={14} />}
                    title="Products"
                    env={env}
                    isGroup
                    onClick={() => setProductGroupOpen((prev) => !prev)}
                  />

                  {/* Floating card for collapsed sidebar */}
                  {!expanded && productGroupOpen && (
                    <div className="absolute left-full top-0 ml-2 w-48 bg-white shadow-lg border rounded-lg z-[9999] flex flex-col">
                      {[
                        { title: "Products", value: "products" },
                        { title: "Features", value: "features" },
                        { title: "Rewards", value: "rewards" },
                      ].map((subTab) => (
                        <Link
                          key={subTab.value}
                          to={pushPage({
                            path: "/products",
                            queryParams: { tab: subTab.value },
                            preserveParams: false,
                          })}
                          className="px-3 py-2 text-left hover:bg-gray-100 text-sm"
                          onClick={() => setProductGroupOpen(false)} // close dropdown after click
                        >
                          {subTab.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <NavButton
              value="customers"
              icon={<CircleUserRound size={14} />}
              title="Customers"
              env={env}
            />
            <NavButton
              value="analytics"
              icon={<ChartColumnBig size={14} />}
              title="Analytics"
              env={env}
            />
            <div>
              {expanded ? (
                <>
                  <NavButton
                    value="dev"
                    icon={<SquareTerminal size={14} />}
                    title="Developer"
                    env={env}
                    onClick={() => setDevGroupOpen((prev) => !prev)}
                    isOpen={devGroupOpen}
                    isGroup
                  />
                  <SidebarGroup
                    value="dev"
                    productGroup={devGroupOpen}
                    subTabs={
                      webhooks
                        ? [
                            { title: "API Keys", value: "api_keys" },
                            { title: "Stripe", value: "stripe" },
                            { title: "Webhooks", value: "webhooks" },
                          ]
                        : [
                            { title: "API Keys", value: "api_keys" },
                            { title: "Stripe", value: "stripe" },
                          ]
                    }
                  />
                </>
              ) : (
                <div className="relative">
                  <NavButton
                    value="dev"
                    icon={<SquareTerminal size={14} />}
                    title="Developer"
                    env={env}
                    isGroup
                    onClick={() => setDevGroupOpen((prev) => !prev)}
                  />

                  {/* Floating card for collapsed sidebar */}
                  {!expanded && devGroupOpen && (
                    <div className="absolute left-full top-0 ml-2 w-48 bg-white shadow-lg border rounded-lg z-[9999] flex flex-col">
                      {(webhooks
                        ? [
                            { title: "API Keys", value: "api_keys" },
                            { title: "Stripe", value: "stripe" },
                            { title: "Webhooks", value: "webhooks" },
                          ]
                        : [
                            { title: "API Keys", value: "api_keys" },
                            { title: "Stripe", value: "stripe" },
                          ]
                      ).map((subTab) => (
                        <Link
                          key={subTab.value}
                          to={pushPage({
                            path: "/dev",
                            queryParams: { tab: subTab.value },
                            preserveParams: false,
                          })}
                          className="px-3 py-2 text-left hover:bg-gray-100 text-sm"
                          onClick={() => setDevGroupOpen(false)} // close after click
                        >
                          {subTab.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* <div className="flex flex-col my-1 gap-0.5 border-l border-zinc-300 ml-4 -translate-x-[1px] pl-0">
            <NavButton
              value="api keys"
              icon={<KeyRound size={14} className="text-t2/75" />}
              title="API Keys"
              env={env}
              className="text-t2/90"
            />
            <NavButton
              value="stripe"
              icon={<Workflow size={14} className="text-t2/75" />}
              title="Connect Stripe"
              env={env}
              className="text-t2/90"
            />
          </div> */}
          </div>
        </div>

        <SidebarBottom />
      </div>
    </SidebarContext.Provider>
  );
};

{
  /* <div
            className={cn(
              "grid transition-[grid-template-rows] duration-150 ease-in-out",
              showProductTab ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            )}
          >
            {expanded && (
              <div
                className={cn(
                  "overflow-hidden flex flex-col my-0 gap-0.5 border-l border-zinc-300 ml-4 -translate-x-[1px] pl-0 transition-opacity duration-150",
                  showProductTab ? "opacity-100" : "opacity-0"
                )}
              >
                <NavButton
                  value="products"
                  subValue="products"
                  title="Products"
                  env={env}
                  isSubNav
                />
                <NavButton
                  value="products"
                  subValue="features"
                  title="Features"
                  env={env}
                  isSubNav
                />
                <NavButton
                  value="products"
                  subValue="rewards"
                  title="Rewards"
                  env={env}
                  isSubNav
                />
              </div>
            )}
          </div> */
}
