import { formatAmount } from "@autumn/shared";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
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
			id: "select",
			size: 36,
			enableSorting: false,
			enableHiding: false,
			header: () => null,
			cell: ({ row }) => (
				<div
					className="flex items-center justify-center"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") e.stopPropagation();
					}}
				>
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={(checked) => row.toggleSelected(!!checked)}
						size="sm"
					/>
				</div>
			),
		},
		{
			accessorKey: "sourceLabel",
			header: "Source",
			size: 180,
			cell: ({ row }) => {
				const charge = row.original;
				const label =
					charge.description || charge.sourceLabel || charge.chargeId;
				return (
					<div className="flex items-center gap-1.5 min-w-0">
						<span className="truncate text-t2">{label}</span>
						{charge.stripeUrl && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									window.open(
										charge.stripeUrl ?? "",
										"_blank",
										"noopener,noreferrer",
									);
								}}
								className="shrink-0 text-t4 hover:text-t2"
							>
								<ArrowSquareOutIcon size={13} />
							</button>
						)}
					</div>
				);
			},
		},
		{
			accessorKey: "createdAt",
			header: "Created",
			size: 100,
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
			size: 100,
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
			size: 100,
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
			size: 110,
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
	];
};
