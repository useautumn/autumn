import type { Reward } from "@autumn/shared";
import { type ProductV2, RewardType } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { RewardRowToolbar } from "./RewardRowToolbar";

export const createRewardsTableColumns = (): ColumnDef<Reward, unknown>[] => {
	return [
		{
			size: 150,
			header: "Name",
			accessorKey: "name",
			cell: ({ row }: { row: Row<Reward> }) => {
				return <div className="font-medium text-t1">{row.original.name}</div>;
			},
		},
		{
			header: "Promo Codes",
			size: 200,
			accessorKey: "promo_codes",
			cell: ({ row }: { row: Row<Reward> }) => {
				const reward = row.original;
				const promoCodes = reward.promo_codes
					.map((promoCode) => promoCode.code)
					.join(", ");
				return (
					<div className="font-mono justify-start flex w-full group overflow-hidden">
						{promoCodes ? (
							<CopyButton
								text={promoCodes}
								size="mini"
								className="w-fit bg-transparent justify-end px-0! border-none shadow-none hover:text-primary [&_svg]:opacity-0 group-hover:[&_svg]:opacity-100 max-w-full"
							/>
						) : (
							<span className="px-1 text-t3">—</span>
						)}
					</div>
				);
			},
		},
		{
			header: "Type",
			size: 120,
			accessorKey: "type",
			cell: ({ row }: { row: Row<Reward> }) => {
				const typeLabels: Record<RewardType, string> = {
					[RewardType.AmountDiscount]: "Amount Discount",
					[RewardType.PercentageDiscount]: "Percentage Discount",
					[RewardType.FreeProduct]: "Free Product",
				};
				return (
					<div className="text-t2">
						{typeLabels[row.original.type] || row.original.type}
					</div>
				);
			},
		},
		{
			header: "Reward",
			size: 150,
			accessorKey: "reward",
			cell: ({ row }: { row: Row<Reward> }) => {
				return <RewardValueCell reward={row.original} />;
			},
		},
		{
			header: "",
			accessorKey: "actions",
			size: 40,
			enableSorting: false,
			cell: ({ row }: { row: Row<Reward> }) => {
				return (
					<div
						className="flex justify-end w-full pr-2"
						onClick={(e) => e.stopPropagation()}
					>
						<RewardRowToolbar reward={row.original} />
					</div>
				);
			},
		},
	];
};

// Helper component for displaying reward value
const RewardValueCell = ({ reward }: { reward: Reward }) => {
	const { products } = useProductsQuery();
	const { org } = useOrg();

	if (reward.type === RewardType.FreeProduct) {
		const product = products.find(
			(p: ProductV2) => p.id === reward.free_product_id,
		);
		return <div className="text-t2">{product?.name || "—"}</div>;
	}

	return (
		<div className="text-t2">
			{reward.discount_config?.discount_value}
			{reward.type === RewardType.PercentageDiscount
				? "%"
				: ` ${org.default_currency || "USD"}`}{" "}
			off
		</div>
	);
};

