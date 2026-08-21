import type { SharedStripeCustomerMismatch } from "@autumn/shared";
import { Fragment } from "react";
import { pushPage } from "@/utils/genUtils";

export function SharedStripeCustomerDetails({
	mismatch,
}: {
	mismatch: SharedStripeCustomerMismatch;
}) {
	const otherCustomers =
		mismatch.other_customers ??
		mismatch.other_customer_ids.map((id) => ({ id, name: null }));

	return (
		<span className="block whitespace-normal break-words text-tertiary-foreground py-2">
			Stripe customer {mismatch.stripe_customer_id} is also linked to Autumn
			customer{otherCustomers.length === 1 ? "" : "(s)"}:{" "}
			{otherCustomers.map((customer, index) => (
				<Fragment key={customer.id}>
					{index > 0 && ", "}
					<a
						href={pushPage({
							path: `/customers/${customer.id}`,
							preserveParams: false,
						})}
						target="_blank"
						rel="noopener"
						className="text-foreground underline underline-offset-2 hover:text-primary"
					>
						{customer.name ?? customer.id}
					</a>
				</Fragment>
			))}
		</span>
	);
}
