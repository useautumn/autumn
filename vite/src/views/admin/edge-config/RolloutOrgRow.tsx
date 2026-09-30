import {
	IconButton,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { RolloutFlipStatus } from "./RolloutFlipStatus";
import { RolloutPercentForm } from "./RolloutPercentForm";
import { ROW_ACTIONS_REVEAL, ROW_LAYOUT } from "./rolloutRowStyles";
import type { RolloutOrg, RolloutPercent } from "./rolloutTypes";

export const ORG_ROW_COLUMNS = "md:grid-cols-[minmax(0,1fr)_160px_200px_72px]";

/** One override: the org, its percent, where its last change stands, and edit / remove. */
export const RolloutOrgRow = ({
	orgId,
	org,
	rollout,
	settleMs,
	onApply,
	onRemove,
	isSaving,
}: {
	orgId: string;
	org?: RolloutOrg;
	rollout: RolloutPercent;
	settleMs: number;
	onApply: ({ percent }: { percent: number }) => void;
	onRemove: () => void;
	isSaving: boolean;
}) => {
	const [editing, setEditing] = useState(false);

	return (
		<div
			className={cn(
				"group hover:bg-interactive-secondary-hover",
				ROW_LAYOUT,
				ORG_ROW_COLUMNS,
			)}
		>
			<div className="order-1 min-w-0 md:order-none">
				<p className="truncate text-sm font-medium text-foreground">
					{org?.name ?? orgId}
				</p>
				<p className="truncate font-mono text-tiny text-tertiary-foreground">
					{org ? `${org.slug} · ${org.id}` : orgId}
				</p>
			</div>

			<div className="order-3 flex items-center gap-3 md:order-none">
				<div className="h-1 flex-1 overflow-clip rounded-full bg-muted">
					<div
						className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
						style={{ width: `${rollout.percent}%` }}
					/>
				</div>
				<span className="w-9 text-right font-mono text-xs tabular-nums text-foreground">
					{rollout.percent}%
				</span>
			</div>

			<RolloutFlipStatus
				rollout={rollout}
				settleMs={settleMs}
				className="order-4 justify-self-end md:order-none md:justify-self-start"
			/>

			<div
				className={cn(
					"order-2 flex items-center justify-end gap-1 md:order-none",
					ROW_ACTIONS_REVEAL,
				)}
			>
				<Popover open={editing} onOpenChange={setEditing}>
					<PopoverTrigger asChild>
						<IconButton
							icon={<Pencil className="size-3.5" />}
							variant="secondary"
							size="sm"
							aria-label={`Edit ${org?.name ?? orgId}`}
						/>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						className="w-auto max-w-[calc(100vw-2rem)] p-3"
					>
						<RolloutPercentForm
							current={rollout.percent}
							onApply={({ percent }) => {
								onApply({ percent });
								setEditing(false);
							}}
							isSaving={isSaving}
						/>
					</PopoverContent>
				</Popover>
				<IconButton
					icon={<Trash2 className="size-3.5" />}
					variant="secondary"
					size="sm"
					onClick={onRemove}
					aria-label={`Remove override for ${org?.name ?? orgId}`}
				/>
			</div>
		</div>
	);
};
