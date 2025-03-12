import { cn } from "@/lib/utils";
import { getRoute } from "@/utils/genUtils";
import { AppEnv } from "@autumn/shared";
import { Link } from "react-router";

export const NavButton = ({
  value,
  icon,
  title,
  env,
  className,
}: {
  value: string;
  icon: React.ReactNode;
  title: string;
  env: AppEnv;
  className?: string;
}) => {
  // Get window path

  const isActive = false;

  return (
    <Link
      to={getRoute(value, env)}
      className={cn(
        `cursor-pointer text-t2 font-medium transition-all duration-100 text-black`,
        isActive && "font-bold text-primary hover:text-primary/80",
        className
      )}
    >
      {icon}
      <span>{title}</span>
    </Link>
  );
};
