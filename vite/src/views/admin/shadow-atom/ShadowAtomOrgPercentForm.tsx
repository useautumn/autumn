import { Button, Input } from "@autumn/ui";
import { useForm } from "@tanstack/react-form";
import { isValidPercent } from "../edge-config/rolloutTypes";

/** An org id and its own percent, in place of the env's. */
export const ShadowAtomOrgPercentForm = ({
	onAdd,
	isSaving,
}: {
	onAdd: ({ orgId, percent }: { orgId: string; percent: number }) => void;
	isSaving: boolean;
}) => {
	const form = useForm({
		defaultValues: { orgId: "", percent: 100 },
		onSubmit: ({ value, formApi }) => {
			onAdd({ orgId: value.orgId.trim(), percent: value.percent });
			formApi.reset();
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
			<form.Field
				name="orgId"
				validators={{
					onChange: ({ value }) => (value.trim() ? undefined : "Org id"),
				}}
			>
				{(field) => (
					<Input
						value={field.state.value}
						onChange={(event) => field.handleChange(event.target.value)}
						placeholder="org id"
						aria-label="Org id"
						className="h-8 w-56 font-mono text-xs"
					/>
				)}
			</form.Field>
			<form.Field
				name="percent"
				validators={{
					onChange: ({ value }) =>
						isValidPercent(value) ? undefined : "0 to 100",
				}}
			>
				{(field) => (
					<Input
						type="number"
						min={0}
						max={100}
						value={field.state.value}
						onChange={(event) => field.handleChange(Number(event.target.value))}
						aria-label="Org percent"
						className="h-8 w-20 font-mono text-xs"
					/>
				)}
			</form.Field>
			<form.Subscribe
				selector={(state) =>
					state.canSubmit && state.values.orgId.trim() !== ""
				}
			>
				{(canSubmit) => (
					<Button
						type="submit"
						size="sm"
						disabled={!canSubmit}
						isLoading={isSaving}
					>
						Set override
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
};
