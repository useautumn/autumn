import { type RewardProgram, RewardTriggerEvent } from "@autumn/shared";
import { MiniCopyButton } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { RewardProgramRowToolbar } from "./RewardProgramRowToolbar";

export const createRewardProgramsTableColumns = (): ColumnDef<
	RewardProgram,
	unknown
>[] => [
	{
		size: 150,
		header: "ID",
		accessorKey: "id",
		cell: ({ row }: { row: Row<RewardProgram> }) => {
			const program = row.original;
			return (
				<div className="font-mono justify-start flex w-full group overflow-hidden">
					{program.id ? (
						<MiniCopyButton text={program.id} />
					) : (
						<span className="px-1 text-tertiary-foreground">—</span>
					)}
				</div>
			);
		},
	},
	{
		header: "Redeem On",
		size: 150,
		accessorKey: "when",
		cell: ({ row }: { row: Row<RewardProgram> }) => {
			const program = row.original;
			return (
				<div className="text-muted-foreground">
					{program.when === RewardTriggerEvent.CustomerCreation
						? "Customer Redemption"
						: keyToTitle(program.when)}
				</div>
			);
		},
	},
	{
		header: "Max Redemptions",
		size: 120,
		accessorKey: "max_redemptions",
		cell: ({ row }: { row: Row<RewardProgram> }) => {
			const program = row.original;
			return (
				<div className="text-muted-foreground">
					{program.unlimited_redemptions
						? "Unlimited"
						: program.max_redemptions}
				</div>
			);
		},
	},
	{
		header: "Products",
		size: 120,
		accessorKey: "products",
		cell: ({ row }: { row: Row<RewardProgram> }) => {
			const program = row.original;
			return (
				<div className="text-muted-foreground">
					{program.when === RewardTriggerEvent.CustomerCreation
						? "Sign Up"
						: program.when === RewardTriggerEvent.Checkout
							? "Checkout"
							: keyToTitle(program.when)}
				</div>
			);
		},
	},
	{
		header: "",
		accessorKey: "actions",
		size: 40,
		enableSorting: false,
		cell: ({ row }: { row: Row<RewardProgram> }) => {
			return (
				<div
					className="flex justify-end w-full pr-2"
					onClick={(e) => e.stopPropagation()}
				>
					<RewardProgramRowToolbar rewardProgram={row.original} />
				</div>
			);
		},
	},
];
