import { Button } from "@autumn/ui";
import { useForm } from "@tanstack/react-form";
import type { RolloutOrg } from "../edge-config/rolloutTypes";
import { ShadowAtomOrgPicker } from "./ShadowAtomOrgPicker";

export const ShadowAtomOrgRegisterForm = ({
	onRegister,
	isSaving,
	disabled,
}: {
	onRegister: ({ orgId }: { orgId: string }) => Promise<boolean>;
	isSaving: boolean;
	disabled: boolean;
}) => {
	const form = useForm({
		defaultValues: { org: null as RolloutOrg | null },
		onSubmit: async ({ value, formApi }) => {
			if (disabled || isSaving || !value.org) return;
			if (await onRegister({ orgId: value.org.id })) formApi.reset();
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
						disabled={disabled}
					/>
				)}
			</form.Field>
			<form.Subscribe selector={(state) => state.values.org !== null}>
				{(hasOrg) => (
					<Button
						type="submit"
						size="sm"
						disabled={disabled || !hasOrg}
						isLoading={isSaving}
					>
						Register
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
};
