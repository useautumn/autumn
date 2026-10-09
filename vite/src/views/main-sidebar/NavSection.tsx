import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@autumn/ui";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";
import { cn } from "@/lib/utils";
import { useSidebarContext } from "./SidebarContext";
import { SIDEBAR_SECTION_HEADER_CLASS } from "./sidebarRowClass";

export const NavSection = ({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) => {
	const { expanded } = useSidebarContext();
	const [storedOpen, setStoredOpen] = useLocalStorage<boolean>(
		`sidebar.section.${title}`,
		true,
	);

	// The collapsed rail has no headers to reopen a section from, so it always lists every row.
	const isOpen = !expanded || storedOpen;

	return (
		<Collapsible
			open={isOpen}
			onOpenChange={setStoredOpen}
			className="flex flex-col gap-px"
		>
			{expanded ? (
				<CollapsibleTrigger className={SIDEBAR_SECTION_HEADER_CLASS}>
					{title}
					<ChevronDown
						className={cn(
							"size-3 shrink-0 transition-transform duration-150 ease-out motion-reduce:transition-none",
							!isOpen && "-rotate-90",
						)}
						strokeWidth={2}
					/>
				</CollapsibleTrigger>
			) : (
				<div className="mx-1.5 mb-1.5 h-px bg-border" />
			)}
			<CollapsibleContent className="flex flex-col gap-px">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
};
