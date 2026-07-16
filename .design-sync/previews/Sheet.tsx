import {
	Badge,
	Button,
	Input,
	Label,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@autumn/ui";

export const Default = () => (
	<Sheet open modal={false}>
		<SheetContent side="right">
			<SheetHeader>
				<SheetTitle>Edit plan</SheetTitle>
				<SheetDescription>
					Changes apply to all 42 customers on the Pro Plan at their next
					renewal.
				</SheetDescription>
			</SheetHeader>
			<div className="flex flex-col gap-3 px-4">
				<div className="flex flex-col gap-1.5">
					<Label>Plan name</Label>
					<Input defaultValue="Pro Plan" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>Price per month</Label>
					<Input defaultValue="49" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>Included API credits</Label>
					<Input defaultValue="100000" />
				</div>
			</div>
			<SheetFooter>
				<Button size="sm">Save changes</Button>
				<Button variant="secondary" size="sm">
					Cancel
				</Button>
			</SheetFooter>
		</SheetContent>
	</Sheet>
);

export const CustomerDetail = () => (
	<Sheet open modal={false}>
		<SheetContent side="right">
			<SheetHeader>
				<SheetTitle>Acme Corp</SheetTitle>
				<SheetDescription>cus_3f8Kd92Lm4</SheetDescription>
			</SheetHeader>
			<div className="flex flex-col gap-3 px-4">
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Plan</span>
					<Badge>Pro</Badge>
				</div>
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Renews</span>
					<span className="text-foreground">Aug 1, 2026</span>
				</div>
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">API Credits</span>
					<span className="text-foreground">62,140 / 100,000</span>
				</div>
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Seats</span>
					<span className="text-foreground">4 / 10</span>
				</div>
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Last invoice</span>
					<span className="text-foreground">$121.40</span>
				</div>
			</div>
			<SheetFooter>
				<Button variant="secondary" size="sm">
					View in Stripe
				</Button>
			</SheetFooter>
		</SheetContent>
	</Sheet>
);

export const SideLeft = () => (
	<Sheet open modal={false}>
		<SheetContent side="left">
			<SheetHeader>
				<SheetTitle>Filters</SheetTitle>
				<SheetDescription>Narrow down the customer list.</SheetDescription>
			</SheetHeader>
			<div className="flex flex-col gap-3 px-4">
				<div className="flex flex-col gap-1.5">
					<Label>Plan</Label>
					<Input placeholder="Pro, Scale, Enterprise" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>Created after</Label>
					<Input defaultValue="2026-01-01" />
				</div>
			</div>
			<SheetFooter>
				<Button size="sm">Apply filters</Button>
			</SheetFooter>
		</SheetContent>
	</Sheet>
);
