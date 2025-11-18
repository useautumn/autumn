import { type RewardProgram, RewardTriggerEvent } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
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
						<CopyButton
							text={program.id}
							size="mini"
							className="w-fit bg-transparent justify-end px-0! border-none shadow-none hover:text-primary [&_svg]:opacity-0 group-hover:[&_svg]:opacity-100 max-w-full"
						/>
					) : (
						<span className="px-1 text-t3">NULL</span>
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
				<div className="text-t2">
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
				<div className="text-t2">
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
				<div className="text-t2">
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

