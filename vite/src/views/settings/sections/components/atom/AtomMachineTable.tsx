import {
	BYOC_CACHE_MACHINES,
	type ByocCacheMachine,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import { InfoTooltip, RadioGroup, RadioGroupItem } from "@autumn/ui";
import { useId } from "react";
import { LabelTag } from "@/components/general/LabelTag";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import {
	ATOM_ACTIVE_CUSTOMERS_NOTE,
	ATOM_CAPACITY_FOOTNOTE,
	atomActiveCustomersLabel,
	atomChecksPerSecondLabel,
} from "./atomMachineCapacity";
import {
	atomMachineLabel,
	atomMachinesLabel,
	atomMonthlyEstimate,
} from "./atomMachineDisplay";

const GRID_CLASS =
	"grid grid-cols-[minmax(0,1fr)_64px_104px_88px_128px_72px] items-center gap-3 px-4 [&>*:not(:first-child)]:text-right [&>*:not(:first-child)]:tabular-nums";

/** Atom's sizes as rows on a section's surface, each with what it handles and priced with its volumes; the one it runs on now is marked Current. */
export const AtomMachineTable = ({
	selected,
	current,
	volumeSizeGib,
	onSelect,
	disabled = false,
}: {
	selected: ByocCacheMachine;
	current?: ByocCacheMachine | null;
	/** Null while a typed size is not valid yet, so no row shows a price for it. */
	volumeSizeGib: number | null;
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
				<span title="Across both replicas">Checks/s</span>
				<span className="inline-flex items-center justify-end gap-1">
					Active customers
					<InfoTooltip>{ATOM_ACTIVE_CUSTOMERS_NOTE}</InfoTooltip>
				</span>
				<span>CPU · RAM</span>
				<span>Machines</span>
				<span>Est. / month</span>
			</div>
			{BYOC_CACHE_MACHINES.map((machine) => {
				const isSelected = machine.instanceType === selected.instanceType;
				const isCurrent = machine.instanceType === current?.instanceType;
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
							{isCurrent && <LabelTag label="CURRENT" />}
						</span>
						<span>{atomChecksPerSecondLabel(machine)}</span>
						<span>{atomActiveCustomersLabel(machine)}</span>
						<span>
							{machine.cpu} · {machine.memory} GiB
						</span>
						<span className="font-mono text-xs">
							{atomMachinesLabel(machine)}
						</span>
						<span className="text-foreground">
							{volumeSizeGib === null
								? "—"
								: atomMonthlyEstimate({ machine, volumeSizeGib })}
						</span>
					</label>
				);
			})}
			<p
				className={cn(
					TABLE_TRAY_SURFACE_DIVIDER_CLASS,
					"px-4 py-2 text-xs text-tertiary-foreground",
				)}
			>
				{ATOM_CAPACITY_FOOTNOTE}
			</p>
		</RadioGroup>
	);
};
