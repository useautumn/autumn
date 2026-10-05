import {
	BYOC_CACHE_MACHINES,
	type ByocCacheMachine,
	DEFAULT_BYOC_CACHE_MACHINE,
	findByocCacheMachine,
} from "@autumn/shared";
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
import { byocCacheMachineSummary } from "@/views/settings/sections/components/byocCache/byocCacheMachineDisplay";
import type { ShadowAtomMachine } from "./shadowAtomTypes";

const MACHINE_ITEMS = BYOC_CACHE_MACHINES.map((machine) => ({
	value: machine.instanceType,
	label: byocCacheMachineSummary(machine),
}));

const keyToMachine = (instanceType: string): ByocCacheMachine =>
	BYOC_CACHE_MACHINES.find(
		(machine) => machine.instanceType === instanceType,
	) ?? DEFAULT_BYOC_CACHE_MACHINE;

/** The machine the Atom runs on when it is one we offer; otherwise the default tier. */
const initialMachine = (current: ShadowAtomMachine | null): ByocCacheMachine =>
	(current && findByocCacheMachine(current)) ?? DEFAULT_BYOC_CACHE_MACHINE;

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
		defaultValues: { machine: initialMachine(current).instanceType as string },
		onSubmit: ({ value }) => {
			const { cpu, memory } = keyToMachine(value.machine);
			onSubmit({ cpu, memory });
		},
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
						<SelectTrigger className="h-8 w-72 text-xs" aria-label="Machine">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{BYOC_CACHE_MACHINES.map((machine) => (
									<SelectItem
										key={machine.instanceType}
										value={machine.instanceType}
										disabled={!machine.available}
									>
										<span className="flex flex-col">
											{byocCacheMachineSummary(machine)}
											{machine.unavailableReason && (
												<span className="text-[11px] text-subtle">
													{machine.unavailableReason}
												</span>
											)}
										</span>
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
