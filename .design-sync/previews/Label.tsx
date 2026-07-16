import { Checkbox, Input, Label, Switch } from "@autumn/ui";
import { CreditCardIcon, UsersIcon } from "@phosphor-icons/react";

export const Default = () => (
	<div className="flex flex-col gap-2">
		<Label>Customer email</Label>
		<Label>Stripe subscription ID</Label>
		<Label>Billing interval</Label>
	</div>
);

export const WithIcon = () => (
	<div className="flex flex-col gap-2">
		<Label>
			<UsersIcon size={16} weight="fill" className="text-subtle" />
			Seats included
		</Label>
		<Label>
			<CreditCardIcon size={16} weight="fill" className="text-subtle" />
			Payment method
		</Label>
	</div>
);

export const WithControls = () => (
	<div className="flex flex-col gap-3">
		<Label>
			<Checkbox defaultChecked />
			Prorate on upgrade
		</Label>
		<Label>
			<Switch defaultChecked />
			Sandbox mode
		</Label>
	</div>
);

export const FieldPair = () => (
	<div className="flex flex-col gap-1.5">
		<Label>Plan name</Label>
		<Input defaultValue="Pro" />
	</div>
);
