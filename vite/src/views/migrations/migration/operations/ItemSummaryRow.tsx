import { getProductItemDisplay } from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { PlanFeatureIcon } from "@/views/products/plan/components/plan-card/PlanFeatureIcon";
import { CustomDotIcon } from "@/views/products/plan/components/plan-card/PlanFeatureRow";
import { migrationItemToProductItem } from "../shared/migrationItemUtils";

export function ItemSummaryRow({
	item,
	onClick,
}: {
	item: Record<string, unknown>;
	onClick?: () => void;
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

	const content = (
		<>
			<div className="flex flex-row items-center gap-1 shrink-0">
				<PlanFeatureIcon item={productItem} position="left" />
				<CustomDotIcon />
				<PlanFeatureIcon item={productItem} position="right" />
			</div>
			<p className="whitespace-nowrap truncate flex-1 min-w-0">
				<span className={cn("text-body", !hasFeatureName && "text-subtle!")}>
					{hasFeatureName ? display.primary_text : "Unconfigured"}
				</span>
				<span className="text-body-secondary"> {display.secondary_text}</span>
			</p>
		</>
	);

	const baseClass =
		"flex items-center gap-2 h-8 px-3 w-full select-none rounded-xl text-left input-base";

	if (!onClick) {
		return <div className={baseClass}>{content}</div>;
	}

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(baseClass, "cursor-pointer input-state-open-tiny")}
		>
			{content}
		</button>
	);
}
