import {
	Button,
	Input,
	Label,
	Popover,
	PopoverContent,
	PopoverTrigger,
	Switch,
} from "@autumn/ui";

export const Default = () => (
	<Popover open modal={false}>
		<PopoverTrigger render={<Button variant="secondary" size="sm" />}>
			Usage settings
		</PopoverTrigger>
		<PopoverContent side="bottom" align="start">
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-1">
					<p className="text-sm font-medium text-foreground">API Credits</p>
					<p className="text-xs text-muted-foreground">
						Set the included allowance for this plan.
					</p>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>Included units</Label>
					<Input defaultValue="100000" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>Overage per unit</Label>
					<Input defaultValue="0.002" />
				</div>
			</div>
		</PopoverContent>
	</Popover>
);

export const WithToggles = () => (
	<Popover open modal={false}>
		<PopoverTrigger render={<Button variant="secondary" size="sm" />}>
			Invoice options
		</PopoverTrigger>
		<PopoverContent side="bottom" align="start">
			<div className="flex flex-col gap-3">
				<p className="text-sm font-medium text-foreground">Invoice options</p>
				<div className="flex items-center justify-between gap-4">
					<span className="text-sm text-muted-foreground">
						Prorate on upgrade
					</span>
					<Switch defaultChecked />
				</div>
				<div className="flex items-center justify-between gap-4">
					<span className="text-sm text-muted-foreground">Email receipt</span>
					<Switch />
				</div>
				<div className="flex items-center justify-between gap-4">
					<span className="text-sm text-muted-foreground">Collect tax</span>
					<Switch defaultChecked />
				</div>
			</div>
		</PopoverContent>
	</Popover>
);

export const Summary = () => (
	<Popover open modal={false}>
		<PopoverTrigger render={<Button variant="secondary" size="sm" />}>
			inv_1PqR2xKz
		</PopoverTrigger>
		<PopoverContent side="bottom" align="start">
			<div className="flex flex-col gap-2">
				<p className="text-sm font-medium text-foreground">Invoice total</p>
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Pro Plan</span>
					<span className="text-foreground">$49.00</span>
				</div>
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Seats × 4</span>
					<span className="text-foreground">$60.00</span>
				</div>
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Credit overage</span>
					<span className="text-foreground">$12.40</span>
				</div>
				<div className="mt-1 flex items-center justify-between border-border border-t pt-2 text-sm font-medium">
					<span className="text-foreground">Total</span>
					<span className="text-foreground">$121.40</span>
				</div>
			</div>
		</PopoverContent>
	</Popover>
);
