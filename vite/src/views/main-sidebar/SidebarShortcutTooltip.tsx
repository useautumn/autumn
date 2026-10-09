import {
	CommandKbd,
	getMetaKey,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import type { ReactElement } from "react";

const SHORTCUT_TOOLTIP_DELAY_MS = 400;

/** Label plus ⌘/Ctrl + key chips, shown after a short hover delay. */
export const SidebarShortcutTooltip = ({
	label,
	shortcutKey,
	side,
	children,
}: {
	label: string;
	shortcutKey: string;
	side: "bottom" | "right";
	children: ReactElement;
}) => (
	<Tooltip delayDuration={SHORTCUT_TOOLTIP_DELAY_MS}>
		<TooltipTrigger render={children} />
		<TooltipContent side={side} className="flex items-center gap-2 pr-1">
			{label}
			<span className="flex gap-0.5">
				<CommandKbd>{getMetaKey()}</CommandKbd>
				<CommandKbd>{shortcutKey}</CommandKbd>
			</span>
		</TooltipContent>
	</Tooltip>
);
