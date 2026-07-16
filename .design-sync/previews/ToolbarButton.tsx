import { Badge, ToolbarButton } from "@autumn/ui";

export const Default = () => (
	<div className="flex items-center gap-2">
		<ToolbarButton />
	</div>
);

export const InCustomerRow = () => (
	<div className="flex w-full max-w-sm items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
		<div className="flex items-center gap-2">
			<span className="text-md font-medium">Acme Corp</span>
			<Badge variant="green">Active</Badge>
		</div>
		<ToolbarButton />
	</div>
);

export const RowList = () => (
	<div className="flex w-full max-w-sm flex-col">
		{["Acme Corp", "Loom Labs", "Vercel Inc"].map((customer) => (
			<div
				className="flex items-center justify-between border-border border-b py-2 last:border-0"
				key={customer}
			>
				<span className="text-md text-muted-foreground">{customer}</span>
				<ToolbarButton />
			</div>
		))}
	</div>
);

export const States = () => (
	<div className="flex items-center gap-3">
		<ToolbarButton />
		<ToolbarButton className="text-primary" />
		<ToolbarButton disabled />
	</div>
);
