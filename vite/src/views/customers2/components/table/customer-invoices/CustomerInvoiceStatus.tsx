import { InvoiceStatus } from "@autumn/shared";

const statusConfig = {
	[InvoiceStatus.Draft]: { color: "bg-gray-400", label: "Draft" },
	[InvoiceStatus.Open]: { color: "bg-orange-500", label: "Open" },
	[InvoiceStatus.Void]: { color: "bg-red-500", label: "Voided" },
	[InvoiceStatus.Paid]: { color: "bg-green-500", label: "Paid" },
	[InvoiceStatus.Uncollectible]: {
		color: "bg-gray-500",
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
