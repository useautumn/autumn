import type { Reward } from "@autumn/shared";
import { type ProductV2, RewardType } from "@autumn/shared";
import { MiniCopyButton } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
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
				return (
					<div className="font-medium text-foreground">{row.original.name}</div>
				);
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
							<MiniCopyButton text={promoCodes} />
						) : (
							<span className="px-1 text-tertiary-foreground">—</span>
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
					[RewardType.FixedDiscount]: "Fixed Discount",
					[RewardType.PercentageDiscount]: "Percentage Discount",
					[RewardType.FreeProduct]: "Free Product",
					[RewardType.InvoiceCredits]: "Invoice Credits",
					[RewardType.FeatureGrant]: "Feature Grant",
				};
				return (
					<div className="text-muted-foreground">
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
		return <div className="text-muted-foreground">{product?.name || "—"}</div>;
	}

	if (reward.type === RewardType.FeatureGrant) {
		const grantCount = reward.entitlements?.length ?? 0;

		return (
			<div className="text-muted-foreground">
				{grantCount > 0
					? `${grantCount} feature grant${grantCount === 1 ? "" : "s"}`
					: "—"}
			</div>
		);
	}

	return (
		<div className="text-muted-foreground">
			{reward.discount_config?.discount_value}
			{reward.type === RewardType.PercentageDiscount
				? "%"
				: ` ${org.default_currency || "USD"}`}{" "}
			off
		</div>
	);
};
