import { Search } from "lucide-react";
import type { KeyboardEvent } from "react";

const MENU_NAVIGATION_KEYS = new Set(["ArrowDown", "ArrowUp", "Escape", "Tab"]);

export const EnvironmentMenuSearch = ({
	query,
	onQueryChange,
}: {
	query: string;
	onQueryChange: (query: string) => void;
}) => {
	// Typed characters must reach the input, not the menu's typeahead.
	const keepTypingInInput = (event: KeyboardEvent<HTMLInputElement>) => {
		if (!MENU_NAVIGATION_KEYS.has(event.key)) {
			event.stopPropagation();
		}
	};

	return (
		<div className="-mx-1 -mt-1 mb-1 flex h-8 items-center gap-2 border-b px-2.5">
			<Search className="size-3.5 shrink-0 text-tertiary-foreground" />
			<input
				aria-label="Switch environment"
				className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-tertiary-foreground"
				onChange={(event) => onQueryChange(event.target.value)}
				onKeyDown={keepTypingInInput}
				placeholder="Switch environment…"
				value={query}
			/>
		</div>
	);
};
