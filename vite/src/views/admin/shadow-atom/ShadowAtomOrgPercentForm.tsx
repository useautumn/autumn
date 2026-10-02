import { Button, Input } from "@autumn/ui";
import { useForm } from "@tanstack/react-form";
import { isValidPercent, type RolloutOrg } from "../edge-config/rolloutTypes";
import { ShadowAtomOrgPicker } from "./ShadowAtomOrgPicker";

/** An org, found by name, and its own percent in place of the env's. */
export const ShadowAtomOrgPercentForm = ({
	onAdd,
	isSaving,
}: {
	onAdd: ({
		orgId,
		percent,
	}: {
		orgId: string;
		percent: number;
	}) => Promise<boolean>;
	isSaving: boolean;
}) => {
	const form = useForm({
		defaultValues: { org: null as RolloutOrg | null, percent: 100 },
		onSubmit: async ({ value, formApi }) => {
			if (isSaving || !value.org) return;
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
					/>
				)}
			</form.Field>
			<form.Field
				name="percent"
				validators={{
					onChange: ({ value }) =>
						isValidPercent(value)
							? undefined
							: "Percent must be a whole number from 0 to 100.",
				}}
			>
				{(field) => (
					<div className="flex flex-col gap-1">
						<Input
							type="number"
							min={0}
							max={100}
							value={field.state.value}
							onChange={(event) =>
								field.handleChange(Number(event.target.value))
							}
							aria-label="Org percent"
							className="h-8 w-20 font-mono text-xs"
						/>
						{field.state.meta.errors.length > 0 && (
							<p role="alert" className="text-tiny text-destructive">
								{field.state.meta.errors.join(" ")}
							</p>
						)}
					</div>
				)}
			</form.Field>
			<form.Subscribe
				selector={(state) => state.canSubmit && state.values.org !== null}
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
