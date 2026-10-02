import { IconButton, StatusChip } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { Trash2 } from "lucide-react";
import {
	ROW_ACTIONS_REVEAL,
	ROW_LAYOUT,
} from "../edge-config/rolloutRowStyles";
import { ShadowAtomPercentInput } from "./ShadowAtomPercentInput";

export const ORG_TABLE_COLUMNS = "md:grid-cols-[minmax(0,1fr)_96px_120px_40px]";

/** One registered org: name · slug, its percent in place, whether its customers are pushed, and remove. */
export const ShadowAtomOrgRow = ({
	title,
	subtitle,
	percent,
	onSetPercent,
	onRemove,
	disabled,
}: {
	title: string;
	subtitle: string;
	percent: number;
	onSetPercent: (percent: number) => void;
	onRemove: () => void;
	disabled: boolean;
}) => (
	<div
		className={cn(
			"group hover:bg-interactive-secondary-hover",
			ROW_LAYOUT,
			ORG_TABLE_COLUMNS,
		)}
	>
		<div className="order-1 min-w-0 md:order-none">
			<p className="truncate text-sm font-medium text-foreground" title={title}>
				{title}
			</p>
			<p
				className="truncate font-mono text-tiny text-tertiary-foreground"
				title={subtitle}
			>
				{subtitle}
			</p>
		</div>
		<div className="order-3 md:order-none">
			<ShadowAtomPercentInput
				key={percent}
				label={`Percent for ${title}`}
				percent={percent}
				onSave={onSetPercent}
				disabled={disabled}
			/>
		</div>
		<div className="order-4 md:order-none">
			{percent > 0 ? (
				<StatusChip tone="green" glyph="play">
					Pushing
				</StatusChip>
			) : (
				<StatusChip tone="neutral" glyph="pause">
					Registered
				</StatusChip>
			)}
		</div>
		<IconButton
			variant="secondary"
			size="sm"
			aria-label={`Remove ${title}`}
			icon={<Trash2 className="size-3.5" />}
			onClick={onRemove}
			disabled={disabled}
			className={cn(
				"order-2 justify-self-end md:order-none",
				ROW_ACTIONS_REVEAL,
			)}
		/>
	</div>
);
