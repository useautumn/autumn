import {
	findFeatureById,
	getFeatureName,
	getProductItemDisplay,
	type ProductItem,
	UsageModel,
} from "@autumn/shared";
import type { ReactNode } from "react";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { prepaidTierStops } from "@/utils/billing/prepaidQuantityUtils";
import { InlinePrepaidQuantity } from "./InlinePrepaidQuantity";
import { PrepaidQuantityControl } from "./plan-items/PrepaidQuantityControl";

const DEFAULT_USAGE_MODELS = [UsageModel.Prepaid];

export function PlanPrepaidQuantityFields({
	items,
	quantities,
	currency,
	readOnly = false,
	usageModels = DEFAULT_USAGE_MODELS,
	layout = "popover",
	renderField,
}: {
	items?: ProductItem[] | null;
	quantities: Record<string, number | undefined>;
	currency?: string;
	readOnly?: boolean;
	usageModels?: UsageModel[];
	layout?: "popover" | "inline";
	renderField: (params: {
		featureId: string;
		step: number;
		stops: number[];
	}) => ReactNode;
}) {
	const { features } = useFeaturesQuery();
	const { org } = useOrg();
	const displayCurrency = currency || org?.default_currency || "USD";
	const featureIds = new Set<string>();
	const prepaidItems = (items ?? []).flatMap((item) => {
		const featureId = item.feature_id;
		if (
			!item.usage_model ||
			!usageModels.includes(item.usage_model) ||
			!featureId ||
			featureIds.has(featureId)
		) {
			return [];
		}

		featureIds.add(featureId);
		return [{ featureId, item }];
	});
	if (prepaidItems.length === 0) return null;

	const isInline = layout === "inline";

	return (
		<div
			className={cn(
				"space-y-1",
				isInline ? "pl-1" : "ml-4 border-l border-border/40 pl-3",
			)}
		>
			{prepaidItems.map(({ featureId, item }) => {
				const step = item.billing_units ?? 1;
				const stops = prepaidTierStops({ item });
				const quantity = quantities[featureId];
				const field = renderField({ featureId, step, stops });

				if (isInline) {
					const display = getProductItemDisplay({
						item,
						features,
						currency: displayCurrency,
						fullDisplay: true,
						amountFormatOptions: { currencyDisplay: "narrowSymbol" },
					});
					const priceNote = [display.primary_text, display.secondary_text]
						.filter(Boolean)
						.join(" ");
					const unitLabel = getFeatureName({
						feature: findFeatureById({ features, featureId }),
						units: quantity ?? 0,
					});
					return (
						<InlinePrepaidQuantity
							key={featureId}
							priceNote={priceNote}
							quantityLabel={`${quantity ?? 0} ${unitLabel}`.trim()}
							readOnly={readOnly}
						>
							{field}
						</InlinePrepaidQuantity>
					);
				}

				return (
					<div className="flex items-center gap-2" key={featureId}>
						<div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
							<PlanItemLabel
								currency={currency}
								item={item}
								showFeatureIcons={false}
							/>
						</div>
						<PrepaidQuantityControl
							billingUnits={step}
							featureId={featureId}
							quantity={quantity}
							readOnly={readOnly}
						>
							{field}
						</PrepaidQuantityControl>
					</div>
				);
			})}
		</div>
	);
}
