import { LabelInput } from "@autumn/ui";

export const Default = () => (
	<LabelInput label="Plan name" placeholder="e.g. Pro" defaultValue="Pro" />
);

export const WithDescription = () => (
	<LabelInput
		label="Feature ID"
		description="Used when calling track() and check() from your backend"
		placeholder="api_credits"
		defaultValue="api_credits"
	/>
);

export const FormStack = () => (
	<div className="flex flex-col gap-3">
		<LabelInput
			label="Customer email"
			placeholder="jane@acme.com"
			defaultValue="jane@acme.com"
		/>
		<LabelInput
			label="Stripe customer ID"
			description="Leave blank to create one automatically"
			placeholder="cus_..."
		/>
	</div>
);

export const Disabled = () => (
	<LabelInput
		label="Subscription ID"
		description="Managed by Stripe and cannot be edited"
		placeholder="sub_..."
		defaultValue="sub_1PqR2xKzD8mLd0"
		disabled
	/>
);
