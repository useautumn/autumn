import { Label, RadioGroup, RadioGroupItem } from "@autumn/ui";

export const BillingInterval = () => (
	<RadioGroup defaultValue="monthly">
		<Label>
			<RadioGroupItem value="monthly" />
			Monthly
		</Label>
		<Label>
			<RadioGroupItem value="annual" />
			Annual
		</Label>
		<Label>
			<RadioGroupItem value="one_off" />
			One-off
		</Label>
	</RadioGroup>
);

export const ProrationBehavior = () => (
	<RadioGroup defaultValue="immediately">
		<Label>
			<RadioGroupItem value="immediately" />
			Charge immediately
		</Label>
		<Label>
			<RadioGroupItem value="next_cycle" />
			Bill next cycle
		</Label>
	</RadioGroup>
);

export const States = () => (
	<RadioGroup defaultValue="usage">
		<Label>
			<RadioGroupItem value="usage" />
			Usage-based price
		</Label>
		<Label>
			<RadioGroupItem value="prepaid" />
			Prepaid quantity
		</Label>
		<Label>
			<RadioGroupItem disabled value="tiered" />
			Tiered (upgrade required)
		</Label>
	</RadioGroup>
);
