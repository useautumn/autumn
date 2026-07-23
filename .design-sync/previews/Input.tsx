import { Input } from "@autumn/ui";

export const Variants = () => (
	<div className="flex flex-col gap-3">
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">default</span>
			<Input placeholder="Search customers by email" />
		</div>
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">destructive</span>
			<Input variant="destructive" defaultValue="pro plan!!" />
			<span className="text-xs text-destructive">
				Feature ID must be lowercase alphanumeric with underscores
			</span>
		</div>
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">headless</span>
			<Input variant="headless" defaultValue="Pro Plan" />
		</div>
	</div>
);

export const WithValues = () => (
	<div className="flex flex-col gap-2">
		<Input defaultValue="acme-corp" />
		<Input defaultValue="cus_3f8Kd92Lm4" />
		<Input type="number" defaultValue="49" />
	</div>
);

export const States = () => (
	<div className="flex flex-col gap-2">
		<Input placeholder="Feature ID" />
		<Input disabled defaultValue="stripe_sub_1PqR2xKz" />
		<Input readOnly defaultValue="am_sk_live_7dK2xQ" />
	</div>
);
