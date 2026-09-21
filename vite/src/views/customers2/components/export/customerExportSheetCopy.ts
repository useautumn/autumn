import { CustomerExportKind } from "@autumn/shared";
import { type Icon, UsersIcon, WarningCircleIcon } from "@phosphor-icons/react";

export const CUSTOMER_EXPORT_SHEET_COPY: Record<
	CustomerExportKind,
	{
		menuIcon: Icon;
		menuLabel: string;
		title: string;
		description: string;
		runningLabel: string;
		submitLabel: string;
	}
> = {
	[CustomerExportKind.Customers]: {
		menuIcon: UsersIcon,
		menuLabel: "Export customers",
		title: "Export customers",
		description: "Download your customer list as a CSV file.",
		runningLabel: "Exporting customers",
		submitLabel: "Start export",
	},
	[CustomerExportKind.BillingVerify]: {
		menuIcon: WarningCircleIcon,
		menuLabel: "Export billing issues",
		title: "Export billing issues",
		description:
			"Check each Stripe-linked customer's billing against Autumn and download the mismatches as a CSV file. Customers without a Stripe customer are skipped. Large accounts can take up to an hour.",
		runningLabel: "Checking customers",
		submitLabel: "Start check",
	},
};
