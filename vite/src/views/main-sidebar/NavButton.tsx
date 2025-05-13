import { useTab } from "@/hooks/useTab";
import { cn } from "@/lib/utils";
import { getRedirectUrl } from "@/utils/genUtils";
import { AppEnv } from "@autumn/shared";
import { Link } from "react-router";
import { useState } from "react";
import { useSidebarContext } from "./SidebarContext";

export const NavButton = ({
  value,
  icon,
  title,
  env,
  className,
  href,
  online = false,
}: {
  value: string;
  icon: any;
  title: string;
  env: AppEnv;
  className?: string;
  href?: string;
  online?: boolean;
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
        `cursor-pointer font-medium transition-all duration-100 
         text-sm flex h-9 items-center text-t2 hover:text-primary`,
        isActive && "font-semibold text-primary hover:text-primary/80",
        className
      )}
      target={href ? "_blank" : undefined}
    >
      <div
        className={cn(
          "flex justify-center w-4 h-4 items-center rounded-sm transition-all duration-100",
          state == "expanded" && "mr-2",
          isHovered && "translate-x-[-1px]"
        )}
      >
        {icon}
      </div>
      {state == "expanded" && <span className="">{title}</span>}
      {online && (
        <span className="relative flex h-2 w-2 ml-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
        </span>
      )}
    </Link>
  );
};
