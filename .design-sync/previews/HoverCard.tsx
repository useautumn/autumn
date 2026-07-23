import { Badge, HoverCard, HoverCardContent, HoverCardTrigger } from "@autumn/ui";

export const Default = () => (
	<div className="flex justify-center py-4">
		<HoverCard open>
			<HoverCardTrigger>
				<span className="text-primary text-sm underline underline-offset-4">
					Acme Corp
				</span>
			</HoverCardTrigger>
			<HoverCardContent side="bottom" align="start">
				<div className="flex flex-col gap-2">
					<p className="text-foreground text-sm font-medium">Acme Corp</p>
					<p className="text-muted-foreground text-xs">billing@acme.com</p>
					<div className="flex items-center gap-2 pt-1">
						<Badge>Pro</Badge>
						<span className="text-muted-foreground text-xs">
							Customer since Jan 2026
						</span>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	</div>
);

export const FeatureUsage = () => (
	<div className="flex justify-center py-4">
		<HoverCard open>
			<HoverCardTrigger>
				<span className="text-primary text-sm underline underline-offset-4">
					API Credits
				</span>
			</HoverCardTrigger>
			<HoverCardContent side="bottom" align="start">
				<div className="flex flex-col gap-2">
					<p className="text-foreground text-sm font-medium">API Credits</p>
					<p className="text-muted-foreground text-xs">
						Metered feature, resets monthly.
					</p>
					<div className="flex items-center justify-between pt-1 text-xs">
						<span className="text-muted-foreground">Used</span>
						<span className="text-foreground">62,140 / 100,000</span>
					</div>
					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground">Resets</span>
						<span className="text-foreground">Aug 1, 2026</span>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	</div>
);

export const PlanPreview = () => (
	<div className="flex justify-center py-4">
		<HoverCard open>
			<HoverCardTrigger>
				<span className="text-primary text-sm underline underline-offset-4">
					Pro Plan
				</span>
			</HoverCardTrigger>
			<HoverCardContent side="bottom" align="start">
				<div className="flex flex-col gap-2">
					<p className="text-foreground text-sm font-medium">Pro — $49/month</p>
					<ul className="flex flex-col gap-1 text-muted-foreground text-xs">
						<li>100,000 API credits included</li>
						<li>$15 per additional seat</li>
						<li>Priority support</li>
					</ul>
					<span className="text-muted-foreground pt-1 text-xs">
						42 active subscribers
					</span>
				</div>
			</HoverCardContent>
		</HoverCard>
	</div>
);
