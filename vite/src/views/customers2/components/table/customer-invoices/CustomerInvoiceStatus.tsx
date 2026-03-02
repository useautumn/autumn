import { InvoiceStatus } from "@autumn/shared";

const statusConfig = {
	[InvoiceStatus.Draft]: {
		color: "bg-gray-400 dark:bg-gray-600",
		label: "Draft",
	},
	[InvoiceStatus.Open]: {
		color: "bg-orange-500 dark:bg-orange-600",
		label: "Open",
	},
	[InvoiceStatus.Void]: {
		color: "bg-red-500 dark:bg-red-600",
		label: "Voided",
	},
	[InvoiceStatus.Paid]: {
		color: "bg-green-500 dark:bg-green-600",
		label: "Paid",
	},
	[InvoiceStatus.Uncollectible]: {
		color: "bg-gray-500 dark:bg-gray-600",
		label: "Uncollectible",
	},
};

export function CustomerInvoiceStatus({
	status,
}: {
	status: InvoiceStatus | null | undefined;
}) {
	if (!status) return null;

	const config = statusConfig[status];
	if (!config) return <div>{status}</div>;

	return (
		<div className="flex items-center gap-1">
			<div className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
			<span>{config.label}</span>
		</div>
	);
}
