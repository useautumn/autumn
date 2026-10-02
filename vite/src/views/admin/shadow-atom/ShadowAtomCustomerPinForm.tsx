import { Button, Input, Switch } from "@autumn/ui";
import { useForm } from "@tanstack/react-form";

type Pin = { orgId: string; customerId: string; included: boolean };

/** Pins one customer in or out of the shadow Atom, whatever the percents say. */
export const ShadowAtomCustomerPinForm = ({
	onPin,
	isSaving,
}: {
	onPin: (pin: Pin) => void;
	isSaving: boolean;
}) => {
	const form = useForm({
		defaultValues: { orgId: "", customerId: "", included: true } as Pin,
		onSubmit: ({ value, formApi }) => {
			onPin({
				orgId: value.orgId.trim(),
				customerId: value.customerId.trim(),
				included: value.included,
			});
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
			{(["orgId", "customerId"] as const).map((name) => (
				<form.Field key={name} name={name}>
					{(field) => (
						<Input
							value={field.state.value}
							onChange={(event) => field.handleChange(event.target.value)}
							placeholder={name === "orgId" ? "org id" : "customer id"}
							aria-label={name === "orgId" ? "Pin org id" : "Pin customer id"}
							className="h-8 w-48 font-mono text-xs"
						/>
					)}
				</form.Field>
			))}
			<form.Field name="included">
				{(field) => (
					<span className="flex items-center gap-1.5 text-xs text-foreground">
						<Switch
							id="shadow-atom-pin-included"
							checked={field.state.value}
							onCheckedChange={(checked) => field.handleChange(checked)}
						/>
						<label htmlFor="shadow-atom-pin-included">
							{field.state.value ? "In" : "Out"}
						</label>
					</span>
				)}
			</form.Field>
			<form.Subscribe
				selector={(state) =>
					state.values.orgId.trim() !== "" &&
					state.values.customerId.trim() !== ""
				}
			>
				{(canSubmit) => (
					<Button
						type="submit"
						size="sm"
						disabled={!canSubmit}
						isLoading={isSaving}
					>
						Pin
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
};
