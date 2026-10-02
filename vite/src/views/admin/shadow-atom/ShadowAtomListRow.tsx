import { IconButton } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import {
	ROW_ACTIONS_REVEAL,
	ROW_LAYOUT,
} from "../edge-config/rolloutRowStyles";

/** One row of a shadow Atom list: what it is, a detail, and remove. */
export const ShadowAtomListRow = ({
	title,
	detail,
	removeLabel,
	onRemove,
	isRemoving,
}: {
	title: string;
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
		<span className="truncate font-mono text-xs text-foreground">{title}</span>
		<span className="text-xs tabular-nums text-tertiary-foreground">
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
