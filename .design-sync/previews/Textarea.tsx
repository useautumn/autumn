import { Textarea } from "@autumn/ui";

export const Default = () => (
	<Textarea placeholder="Describe what this plan includes for customers..." />
);

export const WithValue = () => (
	<Textarea defaultValue="Pro includes 100,000 API credits per month, unlimited seats, and priority support. Overage is billed at $0.002 per credit." />
);

export const States = () => (
	<div className="flex flex-col gap-2">
		<Textarea placeholder="Internal note on this customer" />
		<Textarea disabled defaultValue="Migrated from legacy Stripe subscription on Jan 4." />
	</div>
);
