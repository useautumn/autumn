import type { AppEnv } from "@autumn/shared";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useTab } from "@/hooks/common/useTab";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { notNullish, pushPage } from "@/utils/genUtils";
import { useSidebarContext } from "./SidebarContext";
import { sidebarIconClass, sidebarRowClass } from "./sidebarRowClass";

export const NavButton = ({
	value,
	subValue,
	icon,
	title,
	env,
	className,
	href,
	online = false,
	onClick,
	isOpen,
	isSubNav = false,
	isGroup = false,
	badge,
	isDefaultSubValue = false,
}: {
	value?: string;
	subValue?: string;
	icon?: any;
	title: string;
	env?: AppEnv;
	className?: string;
	href?: string;
	online?: boolean;
	onClick?: () => void;
	isOpen?: boolean;
	isSubNav?: boolean;
	isGroup?: boolean;
	badge?: ReactNode;
	isDefaultSubValue?: boolean;
}) => {
	// Get window path
	const finalEnv = useEnv();
	const tab = useTab();
	const { expanded, onNavigate } = useSidebarContext();
	const [searchParams] = useSearchParams();
	const subTab = searchParams.get("tab");

	const subTabMatches = subValue
		? subTab === subValue || (isDefaultSubValue && !subTab)
		: true;
	const isActive = tab === value && subTabMatches && isOpen !== true;

	const [isHovered, setIsHovered] = useState(false);
	const showTooltip = !expanded && isHovered;

	const TabComponent = () => {
		return (
			<>
				<div className="flex min-w-0 flex-1 items-center gap-2.5">
					{icon && <div className={sidebarIconClass({ isActive })}>{icon}</div>}
					<span
						className={cn(
							"truncate whitespace-nowrap",
							expanded
								? "opacity-100 translate-x-0"
								: "opacity-0 -translate-x-2 pointer-events-none w-0 m-0 p-0",
						)}
					>
						{title}
					</span>
					{badge && expanded && badge}
				</div>
				{online && (
					<span className="relative flex h-2 w-2 ml-2">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
						<span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
					</span>
				)}
				{notNullish(isOpen) && (
					<ChevronRight
						size={14}
						className={cn(
							"ml-1 text-muted-foreground transition-all duration-100 ease-in-out",
							isOpen ? "rotate-90" : "rotate-0",
						)}
					/>
				)}
			</>
		);
	};

	const outerDivClass = cn(
		sidebarRowClass({ isActive }),
		isSubNav && "pl-4",
		className,
	);

	return (
		<div className="relative">
			{!isGroup ? (
				<Link
					to={
						href
							? href
							: pushPage({
									path: `/${value}`,
									queryParams: {
										tab: subValue,
									},
								})
					}
					className={outerDivClass}
					target={href ? "_blank" : undefined}
					onClick={() => {
						// Close mobile sidebar on navigation (skip external links)
						if (!href) {
							onNavigate?.();
						}
					}}
				>
					<TabComponent />
				</Link>
			) : (
				<button type="button" className={outerDivClass} onClick={onClick}>
					<TabComponent />
				</button>
			)}

			{/* Custom Tooltip */}
			{showTooltip && (
				<div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 z-50">
					<div className="relative">
						{/* Arrow */}
						<div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-full">
							<div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-gray-900"></div>
						</div>
						{/* Tooltip content */}
						<div className="bg-gray-900 text-white px-2 py-1 rounded text-sm font-medium whitespace-nowrap">
							{title}
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
