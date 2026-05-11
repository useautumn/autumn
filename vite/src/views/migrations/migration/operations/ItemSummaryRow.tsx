import { getProductItemDisplay } from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { CustomDotIcon } from "@/views/products/plan/components/plan-card/PlanFeatureRow";
import { PlanFeatureIcon } from "@/views/products/plan/components/plan-card/PlanFeatureIcon";
import { migrationItemToProductItem } from "../shared/migrationItemUtils";

export function ItemSummaryRow({
	item,
	onClick,
}: {
	item: Record<string, unknown>;
	onClick: () => void;
}) {
	const { features } = useFeaturesQuery();
	const { org } = useOrg();
	const productItem = migrationItemToProductItem(item, features);

	const display = getProductItemDisplay({
		item: productItem,
		features,
		currency: org?.default_currency || "USD",
		fullDisplay: true,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

	const feature = features.find((f) => f.id === productItem.feature_id);
	const hasFeatureName = feature?.name && feature.name.trim() !== "";

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
			className={cn(
				"flex items-center gap-2 h-8 px-3 w-full select-none rounded-xl cursor-pointer",
				"input-base input-state-open-tiny",
			)}
		>
			<div className="flex flex-row items-center gap-1 shrink-0">
				<PlanFeatureIcon item={productItem} position="left" />
				<CustomDotIcon />
				<PlanFeatureIcon item={productItem} position="right" />
			</div>
			<p className="whitespace-nowrap truncate flex-1 min-w-0">
				<span className={cn("text-body", !hasFeatureName && "text-t4!")}>
					{hasFeatureName ? display.primary_text : "Unconfigured"}
				</span>
				<span className="text-body-secondary"> {display.secondary_text}</span>
			</p>
		</div>
	);
}
