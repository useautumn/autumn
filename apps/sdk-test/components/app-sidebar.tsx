"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { findScenarioByHref, scenarioSections } from "@/lib/scenarios";

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
            <div className="space-y-1">
              {section.items.map((item) => {
                const activeItem = pathname === item.href;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setOpenMobile(false)}
                    className={cn(
                      "block rounded-md border px-2 py-2 transition-colors",
                      activeItem
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-black"
                        : "border-zinc-200 bg-white hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <Badge variant={item.status}>{item.status}</Badge>
                    </div>
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        activeItem
                          ? "text-zinc-300 dark:text-zinc-700"
                          : "text-zinc-500",
                      )}
                    >
                      {item.description}
                    </p>
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
        <aside className="hidden w-72 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:block">
          {sidebarContent}
        </aside>

        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity md:hidden",
            openMobile ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setOpenMobile(false)}
        />
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-72 border-r border-zinc-200 bg-white transition-transform dark:border-zinc-800 dark:bg-zinc-950 md:hidden",
            openMobile ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sidebarContent}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 items-center justify-between border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-950 md:px-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="md:hidden"
                onClick={() => setOpenMobile((prev) => !prev)}
              >
                Menu
              </Button>
              <p className="text-xs text-zinc-500">
                {active
                  ? `${active.section.title} / ${active.item.title}`
                  : "Select a scenario"}
              </p>
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
