import { Checkbox, Label } from "@autumn/ui";

export const Sizes = () => (
	<div className="flex flex-wrap items-center gap-3">
		<Checkbox size="sm" defaultChecked />
		<Checkbox size="md" defaultChecked />
		<Checkbox size="lg" defaultChecked />
	</div>
);

export const States = () => (
	<div className="flex flex-wrap items-center gap-3">
		<Checkbox />
		<Checkbox defaultChecked />
		<Checkbox disabled />
		<Checkbox disabled defaultChecked />
	</div>
);

export const WithLabels = () => (
	<div className="flex flex-col gap-2">
		<Label>
			<Checkbox defaultChecked />
			Prorate on upgrade
		</Label>
		<Label>
			<Checkbox />
			Send invoice via email
		</Label>
		<Label>
			<Checkbox defaultChecked />
			Allow overage billing
		</Label>
	</div>
);
