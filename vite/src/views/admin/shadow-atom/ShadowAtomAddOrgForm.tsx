import { Button } from "@autumn/ui";
import { useForm } from "@tanstack/react-form";
import type { RolloutOrg } from "../edge-config/rolloutTypes";
import { isValidPercent } from "../edge-config/rolloutTypes";
import { ShadowAtomOrgPicker } from "./ShadowAtomOrgPicker";
import { ShadowAtomPercentField } from "./ShadowAtomPercentField";

/** Pick an org by name or slug and its percent: one action registers it on the shadow Atom at that percent. */
export const ShadowAtomAddOrgForm = ({
	onAdd,
	isSaving,
	disabled,
}: {
	onAdd: ({
		orgId,
		percent,
	}: {
		orgId: string;
		percent: number;
	}) => Promise<boolean>;
	isSaving: boolean;
	disabled: boolean;
}) => {
	const form = useForm({
		defaultValues: { org: null as RolloutOrg | null, percent: 100 },
		onSubmit: async ({ value, formApi }) => {
			if (disabled || isSaving || !value.org) return;
			if (!isValidPercent(value.percent)) return;
			if (await onAdd({ orgId: value.org.id, percent: value.percent }))
				formApi.reset();
		},
	});

	return (
		<form
			className="flex flex-wrap items-start gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<form.Field name="org">
				{(field) => (
					<ShadowAtomOrgPicker
						value={field.state.value}
						onChange={field.handleChange}
						disabled={disabled || isSaving}
					/>
				)}
			</form.Field>
			<form.Field name="percent">
				{(field) => (
					<ShadowAtomPercentField
						value={field.state.value}
						onChange={field.handleChange}
						disabled={disabled || isSaving}
					/>
				)}
			</form.Field>
			<form.Subscribe
				selector={(state) =>
					state.values.org !== null && isValidPercent(state.values.percent)
				}
			>
				{(canAdd) => (
					<Button
						type="submit"
						size="sm"
						disabled={disabled || !canAdd}
						isLoading={isSaving}
					>
						Add org
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
};
