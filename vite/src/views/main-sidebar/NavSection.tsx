import type { ReactNode } from "react";
import { useSidebarContext } from "./SidebarContext";

export const NavSection = ({
	title,
	children,
}: {
	title?: string;
	children: ReactNode;
}) => {
	const { expanded } = useSidebarContext();

	return (
		<div className="flex flex-col gap-px">
			{title && expanded && (
				<span className="px-2.5 pb-1.5 text-xs font-medium leading-4 text-[#8A8A8A] dark:text-[#6B6B6B]">
					{title}
				</span>
			)}
			{title && !expanded && <div className="mx-1.5 mb-1.5 h-px bg-border" />}
			{children}
		</div>
	);
};
