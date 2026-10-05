import {
	BYOC_CACHE_MACHINES,
	type ByocCacheMachine,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import { RadioGroup, RadioGroupItem } from "@autumn/ui";
import { cn } from "@/lib/utils";
import {
	SETTINGS_ROW_CLASS,
	SettingsTable,
	TableCell,
	TableRow,
} from "../../../SettingsTable";
import { byocCacheMachineLabel } from "./byocCacheMachineDisplay";

const COLUMNS = [
	{ label: "Size", width: "32%" },
	{ label: "vCPU", width: "14%" },
	{ label: "Memory", width: "14%" },
	{ label: "Instance", width: "20%" },
	{ label: "Est. / month", width: "15%" },
] as const;

export const ByocCacheMachineTable = ({
	selected,
	current,
	onSelect,
	disabled = false,
}: {
	selected: ByocCacheMachine;
	/** The machine the cache runs on now, marked in its row; none before setup. */
	current?: ByocCacheMachine | null;
	onSelect: (machine: ByocCacheMachine) => void;
	disabled?: boolean;
}) => {
	const selectInstanceType = (instanceType: unknown) => {
		const machine = findByocCacheMachineByInstanceType({
			instanceType: String(instanceType),
		});
		if (machine?.available) onSelect(machine);
	};

	return (
		<div className="flex flex-col gap-2">
			<RadioGroup
				className="block"
				value={selected.instanceType}
				onValueChange={selectInstanceType}
				disabled={disabled}
				aria-label="Machine size"
			>
				<SettingsTable columns={COLUMNS}>
					{BYOC_CACHE_MACHINES.map((machine) => {
						const isSelected = machine.instanceType === selected.instanceType;
						const isCurrent = machine.instanceType === current?.instanceType;
						const isSelectable = machine.available && !disabled;
						return (
							<TableRow
								key={machine.instanceType}
								className={cn(
									SETTINGS_ROW_CLASS,
									isSelectable ? "cursor-pointer" : "cursor-not-allowed",
									isSelected && "bg-hover-primary",
									!machine.available && "opacity-60",
								)}
								onClick={() => isSelectable && onSelect(machine)}
							>
								<TableCell className="pl-4">
									<div className="flex items-center gap-3">
										<RadioGroupItem
											value={machine.instanceType}
											disabled={!machine.available}
										/>
										<span className="font-medium text-foreground">
											{byocCacheMachineLabel(machine)}
										</span>
										{machine.unavailableReason && (
											<span className="text-xs text-subtle">
												{machine.unavailableReason}
											</span>
										)}
										{isCurrent && (
											<span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-tertiary-foreground">
												Current
											</span>
										)}
									</div>
								</TableCell>
								<TableCell>{machine.cpu} vCPU</TableCell>
								<TableCell>{machine.memory} GiB</TableCell>
								<TableCell className="font-mono text-xs">
									{machine.instanceType}
								</TableCell>
								<TableCell>
									<span className="text-foreground">
										${machine.estimatedMonthlyUsd}
									</span>
									<span className="text-subtle"> /mo</span>
								</TableCell>
								<TableCell />
							</TableRow>
						);
					})}
				</SettingsTable>
			</RadioGroup>
			<p className="text-xs text-subtle">
				Estimated AWS on-demand price for the instance, billed by AWS to your
				account, plus about $9 a month for the deployment.
			</p>
		</div>
	);
};
