import type { ByocCacheMachine } from "@autumn/shared";
import { cn } from "@/lib/utils";
import {
	byocCacheMachineLabel,
	byocCacheMachineSpecs,
} from "./byocCacheMachineDisplay";

export const ByocCacheMachineCard = ({
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
			{byocCacheMachineLabel(machine)}
		</span>
		<span className="text-xs text-tertiary-foreground">
			{byocCacheMachineSpecs(machine)}
		</span>
		<span className="font-mono text-[11px] text-subtle">
			{machine.instanceType}
		</span>
		<span className="pt-1.5 text-[13px] font-semibold text-foreground">
			${machine.estimatedMonthlyUsd}
			<span className="text-xs font-normal text-subtle"> /mo on AWS</span>
		</span>
	</div>
);
