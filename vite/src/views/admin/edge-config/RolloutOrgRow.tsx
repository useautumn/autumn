import {
	IconButton,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { RolloutFlipStatus } from "./RolloutFlipStatus";
import { RolloutPercentForm } from "./RolloutPercentForm";
import type { RolloutOrg, RolloutPercent } from "./rolloutTypes";

export const ORG_ROW_GRID =
	"grid grid-cols-[minmax(0,1fr)_160px_200px_72px] items-center gap-4 px-4";

/** One override: the org, its percent, where its last change stands, and edit / remove on hover. */
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
			className={`group h-12 hover:bg-interactive-secondary-hover ${ORG_ROW_GRID}`}
		>
			<div className="min-w-0">
				<p className="truncate text-sm font-medium text-foreground">
					{org?.name ?? orgId}
				</p>
				<p className="truncate font-mono text-tiny text-tertiary-foreground">
					{org ? `${org.slug} · ${org.id}` : orgId}
				</p>
			</div>

			<div className="flex items-center gap-3">
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

			<RolloutFlipStatus rollout={rollout} settleMs={settleMs} />

			<div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
				<Popover open={editing} onOpenChange={setEditing}>
					<PopoverTrigger asChild>
						<IconButton
							icon={<Pencil className="size-3.5" />}
							variant="secondary"
							size="sm"
							aria-label={`Edit ${org?.name ?? orgId}`}
						/>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-auto p-3">
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
