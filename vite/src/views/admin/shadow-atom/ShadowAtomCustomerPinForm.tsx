import { Button, Switch } from "@autumn/ui";
import { useForm } from "@tanstack/react-form";
import type {
	RolloutCustomerOption,
	RolloutOrg,
} from "../edge-config/rolloutTypes";
import { ShadowAtomCustomerPicker } from "./ShadowAtomCustomerPicker";
import { ShadowAtomOrgPicker } from "./ShadowAtomOrgPicker";

type Pin = { orgId: string; customerId: string; included: boolean };

/** Pins one customer, found by name within its org, in or out of the shadow Atom whatever the percents say. */
export const ShadowAtomCustomerPinForm = ({
	onPin,
	isSaving,
}: {
	onPin: (pin: Pin) => Promise<boolean>;
	isSaving: boolean;
}) => {
	const form = useForm({
		defaultValues: {
			org: null as RolloutOrg | null,
			customer: null as RolloutCustomerOption | null,
			included: true,
		},
		onSubmit: async ({ value, formApi }) => {
			const { org, customer, included } = value;
			if (isSaving || !org || !customer) return;
			if (await onPin({ orgId: org.id, customerId: customer.id, included }))
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
						onChange={(org) => {
							field.handleChange(org);
							form.setFieldValue("customer", null);
						}}
					/>
				)}
			</form.Field>
			<form.Subscribe selector={(state) => state.values.org?.id ?? null}>
				{(orgId) => (
					<form.Field name="customer">
						{(field) => (
							<ShadowAtomCustomerPicker
								orgId={orgId}
								value={field.state.value}
								onChange={field.handleChange}
							/>
						)}
					</form.Field>
				)}
			</form.Subscribe>
			<form.Field name="included">
				{(field) => (
					<span className="flex h-8 items-center gap-1.5 text-xs text-foreground">
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
					state.values.org !== null && state.values.customer !== null
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
