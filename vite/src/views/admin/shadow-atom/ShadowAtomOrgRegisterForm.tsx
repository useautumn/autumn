import { Button, Input } from "@autumn/ui";
import { useForm } from "@tanstack/react-form";

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
		defaultValues: { orgId: "" },
		onSubmit: async ({ value, formApi }) => {
			const orgId = value.orgId.trim();
			if (disabled || isSaving || !orgId) return;
			if (await onRegister({ orgId })) formApi.reset();
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
			<form.Field name="orgId">
				{(field) => (
					<Input
						value={field.state.value}
						onChange={(event) => field.handleChange(event.target.value)}
						placeholder="org id"
						aria-label="Org id to register"
						disabled={disabled}
						className="h-8 w-56 font-mono text-xs"
					/>
				)}
			</form.Field>
			<form.Subscribe selector={(state) => state.values.orgId.trim() !== ""}>
				{(hasOrgId) => (
					<Button
						type="submit"
						size="sm"
						disabled={disabled || !hasOrgId}
						isLoading={isSaving}
					>
						Register
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
};
