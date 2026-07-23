import {
	Badge,
	Button,
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@autumn/ui";

export const Default = () => (
	<Card>
		<CardHeader>
			<CardTitle>Growth</CardTitle>
			<CardDescription>
				For scaling teams that need usage-based billing.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<div className="text-2xl font-semibold">
				$99
				<span className="text-muted-foreground text-sm font-normal">/month</span>
			</div>
		</CardContent>
	</Card>
);

export const WithAction = () => (
	<Card>
		<CardHeader>
			<CardTitle>Stripe</CardTitle>
			<CardDescription>Connected to acct_1QxLm2RvKp</CardDescription>
			<CardAction>
				<Badge variant="green">Live</Badge>
			</CardAction>
		</CardHeader>
		<CardContent>
			<p className="text-muted-foreground text-sm">
				Invoices and payment methods sync automatically.
			</p>
		</CardContent>
	</Card>
);

export const WithFooter = () => (
	<Card>
		<CardHeader className="border-b">
			<CardTitle>Payment method</CardTitle>
			<CardDescription>Visa ending in 4242</CardDescription>
		</CardHeader>
		<CardContent>
			<p className="text-muted-foreground text-sm">Expires 04/2027</p>
		</CardContent>
		<CardFooter className="border-t gap-2">
			<Button size="sm" variant="secondary">
				Update card
			</Button>
			<Button size="sm" variant="skeleton">
				View invoices
			</Button>
		</CardFooter>
	</Card>
);

export const UsageSummary = () => (
	<Card>
		<CardHeader>
			<CardTitle>This billing period</CardTitle>
			<CardDescription>Mar 1 – Mar 31, 2025</CardDescription>
		</CardHeader>
		<CardContent className="flex flex-col gap-2">
			<div className="flex items-center justify-between text-sm">
				<span className="text-muted-foreground">API calls</span>
				<span className="font-medium tabular-nums">128,402</span>
			</div>
			<div className="flex items-center justify-between text-sm">
				<span className="text-muted-foreground">Seats</span>
				<span className="font-medium tabular-nums">24</span>
			</div>
			<div className="flex items-center justify-between text-sm">
				<span className="text-muted-foreground">Estimated total</span>
				<span className="font-medium tabular-nums">$1,284.00</span>
			</div>
		</CardContent>
	</Card>
);
