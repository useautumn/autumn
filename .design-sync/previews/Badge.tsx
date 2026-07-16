import { Badge } from "@autumn/ui";

export const Variants = () => (
	<div className="flex flex-wrap items-center gap-2">
		<Badge variant="default">Pro</Badge>
		<Badge variant="secondary">Trialing</Badge>
		<Badge variant="muted">Draft</Badge>
		<Badge variant="green">Paid</Badge>
		<Badge variant="outline">Sandbox</Badge>
	</div>
);

export const SubscriptionStatus = () => (
	<div className="flex flex-wrap items-center gap-2">
		<Badge variant="green">Active</Badge>
		<Badge variant="secondary">Past due</Badge>
		<Badge variant="muted">Canceled</Badge>
		<Badge variant="muted">Scheduled</Badge>
	</div>
);

export const Sizes = () => (
	<div className="flex flex-wrap items-center gap-2">
		<Badge size="default" variant="secondary">
			Usage-based
		</Badge>
		<Badge size="sm" variant="secondary">
			Usage-based
		</Badge>
	</div>
);

export const InContext = () => (
	<div className="flex items-center gap-2 text-md">
		<span className="font-medium">Acme Corp</span>
		<Badge variant="green">Active</Badge>
		<Badge variant="muted">Growth plan</Badge>
	</div>
);
