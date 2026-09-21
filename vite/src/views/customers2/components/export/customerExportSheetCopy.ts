import { CustomerExportKind } from "@autumn/shared";

export const CUSTOMER_EXPORT_SHEET_COPY: Record<
	CustomerExportKind,
	{
		menuLabel: string;
		title: string;
		description: string;
		runningLabel: string;
		submitLabel: string;
	}
> = {
	[CustomerExportKind.Customers]: {
		menuLabel: "Export customers",
		title: "Export customers",
		description: "Download your customer list as a CSV file.",
		runningLabel: "Exporting customers",
		submitLabel: "Start export",
	},
	[CustomerExportKind.BillingVerify]: {
		menuLabel: "Export billing issues",
		title: "Export billing issues",
		description:
			"Check every customer's Stripe billing against Autumn and download the mismatches as a CSV file. Large accounts can take up to an hour.",
		runningLabel: "Checking customers",
		submitLabel: "Start check",
	},
};
