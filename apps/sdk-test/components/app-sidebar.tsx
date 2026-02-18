"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { findScenarioByHref, scenarioSections } from "@/lib/scenarios";
import { cn } from "@/lib/utils";

export const AppSidebarLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const pathname = usePathname();
  const [openMobile, setOpenMobile] = useState(false);
  const active = useMemo(
    () => findScenarioByHref({ href: pathname }),
    [pathname],
  );

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Autumn SDK Test
        </p>
        <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Integration Harness
        </p>
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {scenarioSections.map((section) => (
          <div key={section.id} className="mb-5">
            <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const activeItem = pathname === item.href;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setOpenMobile(false)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm",
                      activeItem
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900",
                    )}
                  >
                    <span className="font-medium">{item.title}</span>
                    <Badge
                      variant={item.status}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {item.status}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex h-screen">
        <aside className="hidden w-56 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:block">
          {sidebarContent}
        </aside>

        <button
          type="button"
          aria-label="Close menu"
          className={cn(
            "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden",
            openMobile ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setOpenMobile(false)}
        />
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-56 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:hidden",
            openMobile ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sidebarContent}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 items-center justify-between border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-950 md:px-4">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                Menu
              </Link>
              <div className="text-xs text-zinc-500">
                {active ? (
                  <>
                    <Link
                      href={active.section.items[0]?.href ?? "/"}
                      className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                    >
                      {active.section.title}
                    </Link>
                    <span className="mx-1">/</span>
                    <Link
                      href={active.item.href}
                      className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                    >
                      {active.item.title}
                    </Link>
                  </>
                ) : (
                  "Select a scenario"
                )}
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-6xl px-3 py-4 md:px-6 md:py-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
