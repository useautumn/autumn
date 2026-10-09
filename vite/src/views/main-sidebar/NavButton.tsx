import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { useTab } from "@/hooks/common/useTab";
import { pushPage } from "@/utils/genUtils";
import { useSidebarContext } from "./SidebarContext";
import {
	sidebarIconClass,
	sidebarRowClass,
	sidebarRowContentClass,
} from "./sidebarRowClass";

export const NavButton = ({
	value,
	subValue,
	icon,
	title,
	href,
	onClick,
	isGroup = false,
	isDefaultSubValue = false,
}: {
	value?: string;
	subValue?: string;
	icon?: ReactNode;
	title: string;
	href?: string;
	onClick?: () => void;
	isGroup?: boolean;
	isDefaultSubValue?: boolean;
}) => {
	const tab = useTab();
	const { expanded, onNavigate } = useSidebarContext();
	const [searchParams] = useSearchParams();
	const subTab = searchParams.get("tab");

	const subTabMatches = subValue
		? subTab === subValue || (isDefaultSubValue && !subTab)
		: true;
	const isActive = tab === value && subTabMatches;

	const rowClass = sidebarRowClass({ isActive, isCollapsed: !expanded });
	const content = (
		<div className={sidebarRowContentClass({ isCollapsed: !expanded })}>
			{icon && <div className={sidebarIconClass({ isActive })}>{icon}</div>}
			{expanded && <span className="truncate whitespace-nowrap">{title}</span>}
		</div>
	);

	if (isGroup) {
		return (
			<button
				type="button"
				className={rowClass}
				aria-label={expanded ? undefined : title}
				title={expanded ? undefined : title}
				onClick={onClick}
			>
				{content}
			</button>
		);
	}

	return (
		<Link
			to={
				href ??
				pushPage({
					path: `/${value}`,
					queryParams: {
						tab: subValue,
					},
				})
			}
			className={rowClass}
			aria-label={expanded ? undefined : title}
			title={expanded ? undefined : title}
			target={href ? "_blank" : undefined}
			onClick={() => {
				// Close mobile sidebar on navigation (skip external links)
				if (!href) {
					onNavigate?.();
				}
			}}
		>
			{content}
		</Link>
	);
};
