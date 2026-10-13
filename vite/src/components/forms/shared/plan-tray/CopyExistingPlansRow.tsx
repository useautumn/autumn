import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { CopySimpleIcon, InfoIcon } from "@phosphor-icons/react";

/** The picker's "Copy existing plans" header row; the tooltip names where it copies from. */
export function CopyExistingPlansRow({
	tooltip,
	onCopy,
}: {
	tooltip?: string;
	onCopy: () => void;
}) {
	return (
		<div className="flex w-full items-center gap-2 border-b border-border/50 px-2 py-1.5 text-xs text-tertiary-foreground transition-colors hover:bg-interactive-secondary-hover">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-2"
				onClick={onCopy}
			>
				<CopySimpleIcon size={12} />
				Copy existing plans
			</button>
			{tooltip && (
				<Tooltip>
					<TooltipTrigger asChild>
						<InfoIcon
							size={13}
							className="shrink-0 cursor-default text-subtle transition-colors hover:text-muted-foreground"
						/>
					</TooltipTrigger>
					<TooltipContent>{tooltip}</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}

/** Tooltip copy shared by every sheet that offers the row. */
export const copyExistingPlansTooltip = ({
	isFallback,
	scopeLabel,
}: {
	isFallback: boolean;
	scopeLabel?: string;
}): string | undefined => {
	if (isFallback) {
		return "No customer-level plans — copies the first entity's plans";
	}
	return scopeLabel ? `Copies from selected scope: ${scopeLabel}` : undefined;
};
