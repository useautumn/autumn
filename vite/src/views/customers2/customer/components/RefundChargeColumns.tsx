import { formatAmount } from "@autumn/shared";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import type { RefundableChargeRow } from "./refundChargeTypes";

const renderMoney = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}) => {
	return formatAmount({
		amount,
		currency,
		minFractionDigits: 2,
		amountFormatOptions: {
			currencyDisplay: "narrowSymbol",
		},
	});
};

export const getRefundChargeColumns = (): ColumnDef<RefundableChargeRow>[] => {
	return [
		{
			accessorKey: "sourceLabel",
			header: "Source",
			size: 240,
			cell: ({ row }) => {
				const charge = row.original;
				return (
					<div className="flex min-w-0 flex-col gap-1 py-1">
						<div className="flex items-center gap-2 min-w-0">
							<span className="truncate text-t2">{charge.sourceLabel}</span>
							<Badge variant="muted" className="shrink-0 uppercase">
								{charge.sourceType.replaceAll("_", " ")}
							</Badge>
						</div>
						<div className="truncate text-xs text-t3">
							{charge.description || charge.chargeId}
						</div>
						{charge.productNames.length > 0 && (
							<div className="truncate text-xs text-t4">
								{charge.productNames.join(", ")}
							</div>
						)}
					</div>
				);
			},
		},
		{
			accessorKey: "createdAt",
			header: "Created",
			size: 120,
			cell: ({ row }) => {
				return (
					<span className="text-sm text-t3">
						{format(new Date(row.original.createdAt), "MMM d, yyyy")}
					</span>
				);
			},
		},
		{
			accessorKey: "amountPaid",
			header: "Paid",
			size: 110,
			cell: ({ row }) => {
				return (
					<span className="text-sm text-t2">
						{renderMoney({
							amount: row.original.amountPaid,
							currency: row.original.currency,
						})}
					</span>
				);
			},
		},
		{
			accessorKey: "refundedAmount",
			header: "Refunded",
			size: 110,
			cell: ({ row }) => {
				return (
					<span className="text-sm text-t3">
						{renderMoney({
							amount: row.original.refundedAmount,
							currency: row.original.currency,
						})}
					</span>
				);
			},
		},
		{
			accessorKey: "refundableAmount",
			header: "Refundable",
			size: 120,
			cell: ({ row }) => {
				return (
					<span className="text-sm font-medium text-t2">
						{renderMoney({
							amount: row.original.refundableAmount,
							currency: row.original.currency,
						})}
					</span>
				);
			},
		},
		{
			id: "stripe",
			header: "",
			size: 60,
			cell: ({ row }) => {
				const stripeUrl = row.original.stripeUrl;
				if (!stripeUrl) return null;
				return (
					<div className="flex justify-end">
						<Button
							variant="secondary"
							size="icon"
							onClick={() => window.open(stripeUrl, "_blank")}
						>
							<ArrowSquareOutIcon size={14} />
						</Button>
					</div>
				);
			},
		},
	];
};
