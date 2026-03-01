import { InvoiceStatus } from "@autumn/shared";
import { cn } from "@/lib/utils";

const statusConfig = {
	[InvoiceStatus.Draft]: {
		dot: "bg-gray-400 dark:bg-gray-500",
		bg: "bg-gray-500/10",
		text: "text-gray-600 dark:text-gray-400",
		label: "Draft",
	},
	[InvoiceStatus.Open]: {
		dot: "bg-orange-500 dark:bg-orange-500",
		bg: "bg-orange-500/10",
		text: "text-orange-600 dark:text-orange-400",
		label: "Open",
	},
	[InvoiceStatus.Void]: {
		dot: "bg-red-500 dark:bg-red-500",
		bg: "bg-red-500/10",
		text: "text-red-600 dark:text-red-400",
		label: "Voided",
	},
	[InvoiceStatus.Paid]: {
		dot: "bg-green-500 dark:bg-green-500",
		bg: "bg-green-500/10",
		text: "text-green-600 dark:text-green-400",
		label: "Paid",
	},
	[InvoiceStatus.Uncollectible]: {
		dot: "bg-gray-500 dark:bg-gray-500",
		bg: "bg-gray-500/10",
		text: "text-gray-600 dark:text-gray-400",
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
	if (!config) return <span className="text-xs">{status}</span>;

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
				config.bg,
				config.text,
			)}
		>
			<span className={cn("w-1 h-1 rounded-full", config.dot)} />
			{config.label}
		</span>
	);
}
