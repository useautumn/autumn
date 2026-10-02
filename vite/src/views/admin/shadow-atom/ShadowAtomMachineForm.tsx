import { BYOC_CACHE_MACHINES } from "@autumn/shared";
import {
	Button,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useForm } from "@tanstack/react-form";
import type { ShadowAtomMachine } from "./shadowAtomTypes";

const machineKey = ({ cpu, memory }: ShadowAtomMachine) => `${cpu}x${memory}`;

const MACHINE_ITEMS = BYOC_CACHE_MACHINES.map((machine) => ({
	value: machineKey(machine),
	label: `${machine.cpu} vCPU · ${machine.memory} GiB (${machine.instanceType})`,
}));

const keyToMachine = (key: string): ShadowAtomMachine =>
	BYOC_CACHE_MACHINES.find((machine) => machineKey(machine) === key) ??
	BYOC_CACHE_MACHINES[0];

/** Pick one of the machines a customer's Atom can run on, then submit. */
export const ShadowAtomMachineForm = ({
	current,
	submitLabel,
	onSubmit,
	isSaving,
	disabled,
}: {
	current: ShadowAtomMachine | null;
	submitLabel: string;
	onSubmit: (machine: ShadowAtomMachine) => void;
	isSaving: boolean;
	disabled: boolean;
}) => {
	const form = useForm({
		defaultValues: { machine: machineKey(current ?? BYOC_CACHE_MACHINES[0]) },
		onSubmit: ({ value }) => onSubmit(keyToMachine(value.machine)),
	});

	return (
		<form
			className="flex flex-wrap items-center gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<form.Field name="machine">
				{(field) => (
					<Select
						value={field.state.value}
						items={MACHINE_ITEMS}
						onValueChange={(value) => field.handleChange(String(value))}
					>
						<SelectTrigger className="h-8 w-64 text-xs" aria-label="Machine">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{MACHINE_ITEMS.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				)}
			</form.Field>
			<Button type="submit" size="sm" isLoading={isSaving} disabled={disabled}>
				{submitLabel}
			</Button>
		</form>
	);
};
