import {
	Badge,
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@autumn/ui";

export const Customers = () => (
	<Table>
		<TableHeader>
			<TableRow>
				<TableHead>Customer</TableHead>
				<TableHead>Plan</TableHead>
				<TableHead>Status</TableHead>
				<TableHead className="text-right">MRR</TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			<TableRow>
				<TableCell className="text-foreground">Acme Corp</TableCell>
				<TableCell>Growth</TableCell>
				<TableCell>
					<Badge variant="green">Active</Badge>
				</TableCell>
				<TableCell className="text-right tabular-nums">$99.00</TableCell>
			</TableRow>
			<TableRow>
				<TableCell className="text-foreground">Loom Labs</TableCell>
				<TableCell>Pro</TableCell>
				<TableCell>
					<Badge variant="secondary">Trialing</Badge>
				</TableCell>
				<TableCell className="text-right tabular-nums">$0.00</TableCell>
			</TableRow>
			<TableRow>
				<TableCell className="text-foreground">Vercel Inc</TableCell>
				<TableCell>Enterprise</TableCell>
				<TableCell>
					<Badge variant="green">Active</Badge>
				</TableCell>
				<TableCell className="text-right tabular-nums">$2,400.00</TableCell>
			</TableRow>
		</TableBody>
	</Table>
);

export const InvoicesWithFooter = () => (
	<Table>
		<TableHeader>
			<TableRow>
				<TableHead>Invoice</TableHead>
				<TableHead>Date</TableHead>
				<TableHead className="text-right">Amount</TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			<TableRow>
				<TableCell className="font-mono text-xs">in_1QxLm2RvKp</TableCell>
				<TableCell>Mar 1, 2025</TableCell>
				<TableCell className="text-right tabular-nums">$99.00</TableCell>
			</TableRow>
			<TableRow>
				<TableCell className="font-mono text-xs">in_1PwKj8TzQd</TableCell>
				<TableCell>Feb 1, 2025</TableCell>
				<TableCell className="text-right tabular-nums">$99.00</TableCell>
			</TableRow>
		</TableBody>
		<TableFooter>
			<TableRow>
				<TableCell className="text-foreground">Total</TableCell>
				<TableCell />
				<TableCell className="text-right text-foreground tabular-nums">
					$198.00
				</TableCell>
			</TableRow>
		</TableFooter>
	</Table>
);

export const FeatureUsageWithCaption = () => (
	<Table>
		<TableCaption>Usage for the current billing period.</TableCaption>
		<TableHeader>
			<TableRow>
				<TableHead>Feature</TableHead>
				<TableHead>Included</TableHead>
				<TableHead className="text-right">Used</TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			<TableRow>
				<TableCell className="text-foreground">API calls</TableCell>
				<TableCell className="tabular-nums">100,000</TableCell>
				<TableCell className="text-right tabular-nums">128,402</TableCell>
			</TableRow>
			<TableRow>
				<TableCell className="text-foreground">Seats</TableCell>
				<TableCell className="tabular-nums">25</TableCell>
				<TableCell className="text-right tabular-nums">24</TableCell>
			</TableRow>
			<TableRow>
				<TableCell className="text-foreground">Storage (GB)</TableCell>
				<TableCell className="tabular-nums">500</TableCell>
				<TableCell className="text-right tabular-nums">312</TableCell>
			</TableRow>
		</TableBody>
	</Table>
);
