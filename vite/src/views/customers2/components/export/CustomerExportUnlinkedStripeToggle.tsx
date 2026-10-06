import { Switch } from "@autumn/ui";
import { LinkBreakIcon } from "@phosphor-icons/react";
import { CustomerExportOverviewRow } from "./CustomerExportOverview";

export function CustomerExportUnlinkedStripeToggle({
	includeUnlinkedStripeCustomers,
	onIncludeUnlinkedStripeCustomersChange,
}: {
	includeUnlinkedStripeCustomers: boolean;
	onIncludeUnlinkedStripeCustomersChange: (include: boolean) => void;
}) {
	return (
		<CustomerExportOverviewRow
			icon={LinkBreakIcon}
			label="Unlinked Stripe"
			action={
				<Switch
					aria-label="Include Stripe customers missing from Autumn"
					checked={includeUnlinkedStripeCustomers}
					onCheckedChange={onIncludeUnlinkedStripeCustomersChange}
				/>
			}
		>
			<span className="text-tertiary-foreground">
				Include Stripe customers missing from Autumn
			</span>
		</CustomerExportOverviewRow>
	);
}
