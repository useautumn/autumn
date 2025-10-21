import type { AppEnv } from "@autumn/shared";
import type { ReactNode } from "react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { pushPage } from "@/utils/genUtils";
import { NavButton } from "./NavButton";
import { useSidebarContext } from "./SidebarContext";
import { Link } from "react-router";

interface SubTab {
	title: string;
	value: string;
}

interface CollapsibleNavGroupProps {
	value: string;
	icon: ReactNode;
	title: string;
	env: AppEnv;
	isOpen: boolean;
	onToggle: () => void;
	subTabs: SubTab[];
}

export const CollapsibleNavGroup = ({
	value,
	icon,
	title,
	env,
	isOpen,
	onToggle,
	subTabs,
}: CollapsibleNavGroupProps) => {
	const { expanded } = useSidebarContext();
	const [dropdownOpen, setDropdownOpen] = useState(false);

	if (!expanded) {
		return (
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<div>
						<NavButton
							value={value}
							icon={icon}
							title={title}
							env={env}
							isGroup
						/>
					</div>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					side="right"
					align="start"
					className="border-1 border-zinc-200 shadow-sm"
				>
					{subTabs.map((subTab, index) => (
						<DropdownMenuItem key={index} asChild>
							<Link
								to={pushPage({
									path: `/${value}`,
									queryParams: {
										tab: subTab.value,
									},
									preserveParams: false,
								})}
								className="cursor-pointer"
								onClick={() => setDropdownOpen(false)}
							>
								{keyToTitle(subTab.title)}
							</Link>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return (
		<div>
			<NavButton
				value={value}
				onClick={onToggle}
				icon={icon}
				title={title}
				env={env}
				isOpen={isOpen}
				isGroup
			/>
			<div
				className={cn(
					"grid transition-[grid-template-rows] duration-150 ease-in-out",
					isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div
					className={cn(
						"overflow-hidden flex flex-col my-0 gap-0.5 border-l border-zinc-300 ml-4 -translate-x-[1px] pl-0 transition-all duration-150",
						isOpen ? "opacity-100 my-0.5" : "opacity-0",
					)}
				>
					{subTabs.map((subTab, index) => (
						<NavButton
							key={index}
							value={value}
							subValue={subTab.value}
							title={keyToTitle(subTab.title)}
							isSubNav
						/>
					))}
				</div>
			</div>
		</div>
	);
};
