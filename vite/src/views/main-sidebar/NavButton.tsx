import { useTab } from "@/hooks/useTab";
import { cn } from "@/lib/utils";
import { getRedirectUrl } from "@/utils/genUtils";

import { AppEnv } from "@autumn/shared";
import { Link } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { useSidebarContext } from "./SidebarContext";
import posthog from "posthog-js";

export const NavButton = ({
  value,
  icon,
  title,
  env,
  className,
  href,
}: {
  value: string;
  icon: any;
  title: string;
  env: AppEnv;
  className?: string;
  href?: string;
}) => {
  // Get window path
  const { state } = useSidebarContext();

  const tab = useTab();
  const isActive = tab == value;

  const [isHovered, setIsHovered] = useState(false);
  return (
    <Link
      to={href ? href : getRedirectUrl(`/${value}`, env)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        `cursor-pointer text-t2 font-medium transition-all duration-100 
        text-black text-sm flex h-9 items-center text-t2 hover:text-primary`,
        isActive && "font-bold text-primary hover:text-primary/80",
        className
      )}
      target={href ? "_blank" : undefined}
    >
      <div
        className={cn(
          "flex justify-center w-4 h-4 items-center bg-zinc-100 rounded-sm transition-all duration-100",
          state == "expanded" && "mr-2",
          isHovered && "translate-x-[-1px]"
        )}
      >
        <FontAwesomeIcon icon={icon} size="sm" />
      </div>
      {state == "expanded" && <span className=" font-semibold">{title}</span>}
    </Link>
  );
};
