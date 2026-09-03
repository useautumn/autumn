import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";

/** Dot rather than a badge so an unclaimed org costs ~8px, not a column. */
export const AdminOrgUnclaimedDot = () => (
	<Tooltip>
		<TooltipTrigger asChild>
			<button
				aria-label="Unclaimed: agent-provisioned, no owner yet"
				className="-m-1 shrink-0 cursor-default p-1"
				type="button"
			>
				<span className="block size-1.5 rounded-full bg-amber-500" />
			</button>
		</TooltipTrigger>
		<TooltipContent>Unclaimed — agent-provisioned, no owner yet</TooltipContent>
	</Tooltip>
);
