import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import { DotsThreeIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type PlanRowAction = {
	label: string;
	icon: ReactNode;
	onSelect: () => void;
};

/** Row-level actions behind a "…" button, sitting next to the scope picker. */
export function PlanRowActionsMenu({ actions }: { actions: PlanRowAction[] }) {
	if (actions.length === 0) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<IconButton
					aria-label="Plan actions"
					className="size-6 shrink-0 text-tertiary-foreground"
					icon={<DotsThreeIcon />}
					size="sm"
					type="button"
					variant="muted"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="max-w-64">
				{actions.map(({ label, icon, onSelect }) => (
					<DropdownMenuItem key={label} onClick={onSelect}>
						<span className="shrink-0 text-tertiary-foreground">{icon}</span>
						<span className="truncate">{label}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
