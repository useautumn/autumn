import type { ByocCacheMachine } from "@autumn/shared";
import { cn } from "@/lib/utils";
import {
	atomEstimatedMonthly,
	atomMachineLabel,
	atomMachineSpecs,
	atomMachinesLabel,
} from "./atomMachineDisplay";

export const AtomMachineCard = ({
	caption,
	machine,
	isTarget = false,
}: {
	caption: string;
	machine: ByocCacheMachine;
	isTarget?: boolean;
}) => (
	<div
		className={cn(
			"flex flex-1 flex-col gap-0.5 rounded-md border bg-card px-3 py-2.5",
			isTarget && "border-primary bg-hover-primary",
		)}
	>
		<span
			className={cn(
				"text-[11px] font-medium text-subtle",
				isTarget && "text-primary",
			)}
		>
			{caption}
		</span>
		<span className="text-[15px] font-semibold tracking-tight text-foreground">
			{atomMachineLabel(machine)}
		</span>
		<span className="text-xs text-tertiary-foreground">
			{atomMachineSpecs(machine)}
		</span>
		<span className="font-mono text-[11px] text-subtle">
			{atomMachinesLabel(machine)}
		</span>
		<span className="pt-1.5 text-[13px] font-semibold text-foreground">
			{atomEstimatedMonthly(machine)}
			<span className="text-xs font-normal text-subtle"> /mo est.</span>
		</span>
	</div>
);
