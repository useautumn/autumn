import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@autumn/ui";

export const Default = () => (
	<Accordion defaultValue={["credits"]}>
		<AccordionItem value="credits">
			<AccordionTrigger>API Credits</AccordionTrigger>
			<AccordionContent>
				<p className="text-muted-foreground text-sm">
					100,000 credits included per month. Overage is billed at $0.002 per
					credit and resets on the 1st.
				</p>
			</AccordionContent>
		</AccordionItem>
		<AccordionItem value="seats">
			<AccordionTrigger>Seats</AccordionTrigger>
			<AccordionContent>
				<p className="text-muted-foreground text-sm">
					Prepaid at $15 per seat per month, prorated on upgrade.
				</p>
			</AccordionContent>
		</AccordionItem>
		<AccordionItem value="support">
			<AccordionTrigger>Priority support</AccordionTrigger>
			<AccordionContent>
				<p className="text-muted-foreground text-sm">
					Boolean feature included with Pro and Enterprise plans.
				</p>
			</AccordionContent>
		</AccordionItem>
	</Accordion>
);

export const Multiple = () => (
	<Accordion type="multiple" defaultValue={["proration", "invoicing"]}>
		<AccordionItem value="proration">
			<AccordionTrigger>How does proration work?</AccordionTrigger>
			<AccordionContent>
				<p className="text-muted-foreground text-sm">
					Upgrading mid-cycle charges the difference immediately. Downgrades
					take effect at the end of the period.
				</p>
			</AccordionContent>
		</AccordionItem>
		<AccordionItem value="invoicing">
			<AccordionTrigger>When are invoices created?</AccordionTrigger>
			<AccordionContent>
				<p className="text-muted-foreground text-sm">
					Autumn creates a Stripe invoice at each renewal and whenever usage
					overage is finalized.
				</p>
			</AccordionContent>
		</AccordionItem>
	</Accordion>
);

export const Collapsed = () => (
	<Accordion>
		<AccordionItem value="free">
			<AccordionTrigger>Free</AccordionTrigger>
			<AccordionContent>
				<p className="text-muted-foreground text-sm">
					1,000 credits per month, 1 seat.
				</p>
			</AccordionContent>
		</AccordionItem>
		<AccordionItem value="pro">
			<AccordionTrigger>Pro — $49/month</AccordionTrigger>
			<AccordionContent>
				<p className="text-muted-foreground text-sm">
					100,000 credits per month, up to 10 seats.
				</p>
			</AccordionContent>
		</AccordionItem>
		<AccordionItem value="enterprise">
			<AccordionTrigger>Enterprise</AccordionTrigger>
			<AccordionContent>
				<p className="text-muted-foreground text-sm">
					Custom limits and annual invoicing.
				</p>
			</AccordionContent>
		</AccordionItem>
	</Accordion>
);
