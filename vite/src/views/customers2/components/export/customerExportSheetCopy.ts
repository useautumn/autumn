import { CustomerExportKind } from "@autumn/shared";
import {
	type Icon,
	SlidersHorizontalIcon,
	UsersIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";

export const CUSTOMER_EXPORT_SHEET_COPY: Record<
	CustomerExportKind,
	{
		menuIcon: Icon;
		menuLabel: string;
		title: string;
		/** Fixed-column kinds describe their columns instead of offering a picker. */
		columnsSummary?: string;
		description: string;
		scanningLabel?: string;
		runningLabel: string;
		submitLabel: string;
	}
> = {
	[CustomerExportKind.Customers]: {
		menuIcon: UsersIcon,
		menuLabel: "Customers",
		title: "Export customers",
		description: "Download your customer list as a CSV file.",
		runningLabel: "Exporting customers",
		submitLabel: "Start export",
	},
	[CustomerExportKind.BillingVerify]: {
		menuIcon: WarningCircleIcon,
		menuLabel: "Billing issues",
		title: "Export billing issues",
		columnsSummary: "Customer, subscription, issue and details",
		description:
			"Check each Stripe-linked customer's billing against Autumn and download the mismatches as a CSV file. Customers without a Stripe customer are skipped. Large accounts can take up to an hour.",
		scanningLabel: "Scanning Stripe subscriptions",
		runningLabel: "Checking customers",
		submitLabel: "Start check",
	},
	[CustomerExportKind.CustomPlans]: {
		menuIcon: SlidersHorizontalIcon,
		menuLabel: "Custom plans",
		title: "Export custom plans",
		columnsSummary: "Customer, plan, reason and what differs",
		description:
			"Compare each customer's plan with the catalog version it's on and download one row per plan: whether it's really custom, and what differs.",
		runningLabel: "Checking plans",
		submitLabel: "Start check",
	},
};
