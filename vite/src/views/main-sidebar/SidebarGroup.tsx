import { cn } from "@/lib/utils";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { NavButton } from "./NavButton";
import { useSidebarContext } from "./SidebarContext";

export const SidebarGroup = ({
	value,
	productGroup,
	subTabs,
}: {
	value: string;
	productGroup: boolean;
	subTabs: { title: string; value: string }[];
}) => {
	const { expanded } = useSidebarContext();
	return (
		<div
			className={cn(
				"grid transition-[grid-template-rows] duration-150 ease-in-out",
				productGroup ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
			)}
		>
			{expanded && (
				<div
					className={cn(
						"overflow-hidden flex flex-col my-0 gap-0.5 border-l border-zinc-300 ml-4 -translate-x-[1px] pl-0 transition-all duration-150",
						productGroup ? "opacity-100 my-0.5" : "opacity-0",
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
			)}
		</div>
	);
};
