import { IconButton } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import {
	ROW_ACTIONS_REVEAL,
	ROW_LAYOUT,
} from "../edge-config/rolloutRowStyles";

/** One row of a shadow Atom list: its name with the id under it, a detail, and remove. */
export const ShadowAtomListRow = ({
	title,
	subtitle,
	detail,
	removeLabel,
	onRemove,
	isRemoving,
}: {
	title: string;
	subtitle: string;
	detail: ReactNode;
	removeLabel: string;
	onRemove: () => void;
	isRemoving: boolean;
}) => (
	<div
		className={cn(
			"group hover:bg-interactive-secondary-hover md:grid-cols-[minmax(0,1fr)_200px_40px]",
			ROW_LAYOUT,
		)}
	>
		<div className="order-1 min-w-0 md:order-none">
			<p className="truncate text-sm font-medium text-foreground">{title}</p>
			<p className="truncate font-mono text-tiny text-tertiary-foreground">
				{subtitle}
			</p>
		</div>
		<span className="order-3 text-xs tabular-nums text-tertiary-foreground md:order-none">
			{detail}
		</span>
		<IconButton
			variant="secondary"
			size="sm"
			aria-label={removeLabel}
			icon={<Trash2 className="size-3.5" />}
			onClick={onRemove}
			disabled={isRemoving}
			className={cn(
				"order-2 justify-self-end md:order-none",
				ROW_ACTIONS_REVEAL,
			)}
		/>
	</div>
);
