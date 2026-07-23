import { Button } from "@autumn/ui";

export const Variants = () => (
	<div className="flex flex-wrap items-center gap-2">
		<Button variant="primary">Create product</Button>
		<Button variant="secondary">Cancel</Button>
		<Button variant="muted">Filter</Button>
		<Button variant="skeleton">View details</Button>
		<Button variant="destructive">Delete customer</Button>
		<Button variant="dotted">Add feature</Button>
	</div>
);

export const Sizes = () => (
	<div className="flex flex-wrap items-center gap-2">
		<Button size="default">Default</Button>
		<Button size="sm">Small</Button>
		<Button size="mini">Mini</Button>
	</div>
);

export const States = () => (
	<div className="flex flex-wrap items-center gap-2">
		<Button isLoading>Saving</Button>
		<Button disabled>Disabled</Button>
		<Button variant="secondary" disabled>
			Disabled secondary
		</Button>
	</div>
);
