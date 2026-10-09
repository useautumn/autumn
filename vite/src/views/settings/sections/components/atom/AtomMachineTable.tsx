import {
	BYOC_CACHE_MACHINES,
	type ByocCacheMachine,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import { RadioGroup, RadioGroupItem } from "@autumn/ui";
import { useId } from "react";
import { LabelTag } from "@/components/general/LabelTag";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import {
	atomMachineLabel,
	RECOMMENDED_ATOM_INSTANCE_TYPE,
} from "./atomMachineDisplay";

const GRID_CLASS =
	"grid grid-cols-[minmax(0,1fr)_64px_80px_96px] items-center gap-4 px-4 [&>*:not(:first-child)]:text-right [&>*:not(:first-child)]:tabular-nums";

/** Atom's sizes as rows on a section's surface; the one it runs on now is marked Current. */
export const AtomMachineTable = ({
	selected,
	current,
	onSelect,
	disabled = false,
}: {
	selected: ByocCacheMachine;
	current?: ByocCacheMachine | null;
	onSelect: (machine: ByocCacheMachine) => void;
	disabled?: boolean;
}) => {
	const radioIdPrefix = useId();
	const selectInstanceType = (instanceType: unknown) => {
		const machine = findByocCacheMachineByInstanceType({
			instanceType: String(instanceType),
		});
		if (machine) onSelect(machine);
	};

	return (
		<RadioGroup
			className="block gap-0"
			value={selected.instanceType}
			onValueChange={selectInstanceType}
			disabled={disabled}
			aria-label="Size"
		>
			<div
				className={cn(
					GRID_CLASS,
					TABLE_TRAY_SURFACE_DIVIDER_CLASS,
					"h-8 text-xs text-subtle",
				)}
			>
				<span>Size</span>
				<span>vCPU</span>
				<span>Memory</span>
				<span>Per month</span>
			</div>
			{BYOC_CACHE_MACHINES.map((machine) => {
				const isSelected = machine.instanceType === selected.instanceType;
				const isCurrent = machine.instanceType === current?.instanceType;
				const isRecommended =
					!current && machine.instanceType === RECOMMENDED_ATOM_INSTANCE_TYPE;
				const radioId = `${radioIdPrefix}-${machine.instanceType}`;
				return (
					<label
						key={machine.instanceType}
						htmlFor={radioId}
						className={cn(
							GRID_CLASS,
							TABLE_TRAY_SURFACE_DIVIDER_CLASS,
							"h-10 cursor-pointer text-sm text-tertiary-foreground hover:bg-table-row-hover",
							isSelected && "bg-primary/[0.06]",
						)}
					>
						<span className="flex items-center gap-3">
							<RadioGroupItem id={radioId} value={machine.instanceType} />
							<span className="font-medium text-foreground">
								{atomMachineLabel(machine)}
							</span>
							{isRecommended && <LabelTag label="RECOMMENDED" />}
							{isCurrent && <LabelTag label="CURRENT" />}
						</span>
						<span>{machine.cpu}</span>
						<span>{machine.memory} GB</span>
						<span className="text-foreground">
							${machine.estimatedMonthlyUsd}
						</span>
					</label>
				);
			})}
		</RadioGroup>
	);
};
