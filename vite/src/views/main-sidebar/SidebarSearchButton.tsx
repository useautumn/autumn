import { Search } from "lucide-react";
import { useCommandBarStore } from "@/hooks/stores/useCommandBarStore";
import {
	SIDEBAR_HEADER_ICON_BUTTON_CLASS,
	SIDEBAR_ICON_STROKE,
} from "./sidebarRowClass";

export const SidebarSearchButton = () => {
	const openCommandBar = useCommandBarStore((state) => state.openCommandBar);

	return (
		<button
			type="button"
			aria-label="Search"
			title="Search (⌘K)"
			onClick={openCommandBar}
			className={SIDEBAR_HEADER_ICON_BUTTON_CLASS}
		>
			<Search className="size-[15px]" strokeWidth={SIDEBAR_ICON_STROKE} />
		</button>
	);
};
