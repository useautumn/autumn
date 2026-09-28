import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import { DotsThreeIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export const ROW_ACTION_ICON_SIZE = 14;

export type PlanRowAction = {
	label: string;
	icon: ReactNode;
} & ({ onSelect: () => void } | { submenu: ReactNode });

/** Row-level actions behind a "…" button, sitting next to the scope picker. */
export function PlanRowActionsMenu({
	actions,
	label = "Plan actions",
	variant = "muted",
}: {
	actions: PlanRowAction[];
	label?: string;
	/** "secondary" when the trigger sits in a bordered button group. */
	variant?: "muted" | "secondary";
}) {
	if (actions.length === 0) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<IconButton
					aria-label={label}
					className="size-6 shrink-0 text-tertiary-foreground"
					icon={<DotsThreeIcon />}
					size="sm"
					type="button"
					variant={variant}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="max-w-64">
				{actions.map((action) =>
					"submenu" in action ? (
						<DropdownMenuSub key={action.label}>
							<DropdownMenuSubTrigger>
								<span className="shrink-0 text-tertiary-foreground">
									{action.icon}
								</span>
								<span className="truncate">{action.label}</span>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent className="w-64">
								{action.submenu}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					) : (
						<DropdownMenuItem key={action.label} onClick={action.onSelect}>
							<span className="shrink-0 text-tertiary-foreground">
								{action.icon}
							</span>
							<span className="truncate">{action.label}</span>
						</DropdownMenuItem>
					),
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
