import { CustomerExportKind } from "@autumn/shared";
import { type Icon, UsersIcon, WarningCircleIcon } from "@phosphor-icons/react";

export const CUSTOMER_EXPORT_SHEET_COPY: Record<
	CustomerExportKind,
	{
		menuIcon: Icon;
		menuLabel: string;
		title: string;
		description: string;
		scanningLabel?: string;
		runningLabel: string;
		/** What the progress counts measure. */
		unitLabel: string;
		submitLabel: string;
	}
> = {
	[CustomerExportKind.Customers]: {
		menuIcon: UsersIcon,
		menuLabel: "Export customers",
		title: "Export customers",
		description: "Download your customer list as a CSV file.",
		runningLabel: "Exporting customers",
		unitLabel: "rows",
		submitLabel: "Start export",
	},
	[CustomerExportKind.BillingVerify]: {
		menuIcon: WarningCircleIcon,
		menuLabel: "Export billing issues",
		title: "Export billing issues",
		description:
			"Check each Stripe-linked customer's billing against Autumn and download the mismatches as a CSV file. Customers with no Stripe-linked plan are skipped, so the count below covers only those checked. Large accounts can take up to an hour.",
		scanningLabel: "Scanning Stripe subscriptions",
		runningLabel: "Checking customers",
		unitLabel: "customers",
		submitLabel: "Start check",
	},
};
