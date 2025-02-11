"use client";
import { cn } from "@/lib/utils";
import { SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { navigateTo } from "@/utils/genUtils";
import { usePathname, useRouter } from "next/navigation";

export const TabButton = ({
  value,
  icon,
  title,
  env,
  className,
  href,
}: any) => {
  // Get window path
  const path = usePathname();
  const isActive = path.includes(value);
  const router = useRouter();

  return (
    <SidebarMenuItem key={value}>
      <SidebarMenuButton asChild>
        <div
          onClick={() => {
            if (href) {
              window.open(href, "_blank");
            } else {
              navigateTo(`/${value}`, router, env);
            }
          }}
          className={cn(
            `cursor-pointer text-t2 font-medium transition-all duration-100`,
            isActive && "font-bold text-primary hover:text-primary/80",
            className
          )}
        >
          {icon}
          <span>{title}</span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
