import { Badge } from "@autumn/ui";
import { X } from "lucide-react";
import type { RolloutCustomerOption } from "./rolloutTypes";

/** The customers picked so far, each removable. */
export const SelectedCustomers = ({
	customers,
	onRemove,
}: {
	customers: RolloutCustomerOption[];
	onRemove: (customer: RolloutCustomerOption) => void;
}) => (
	<div className="flex flex-wrap gap-1.5">
		{customers.map((customer) => (
			<Badge key={customer.id} variant="muted" className="gap-1 pr-1">
				<span className="max-w-40 truncate">
					{customer.name ?? customer.id}
				</span>
				<button
					type="button"
					onClick={() => onRemove(customer)}
					className="rounded-sm text-tertiary-foreground hover:text-foreground"
					aria-label={`Remove ${customer.id}`}
				>
					<X className="size-3" />
				</button>
			</Badge>
		))}
	</div>
);
