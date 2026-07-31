import { type ProductItem, UsageModel } from "@autumn/shared";
import type { ReactNode } from "react";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { PrepaidQuantityControl } from "./plan-items/PrepaidQuantityControl";

export function PlanPrepaidQuantityFields({
	items,
	quantities,
	currency,
	readOnly = false,
	renderField,
}: {
	items?: ProductItem[] | null;
	quantities: Record<string, number | undefined>;
	currency?: string;
	readOnly?: boolean;
	renderField: (params: { featureId: string; step: number }) => ReactNode;
}) {
	const featureIds = new Set<string>();
	const prepaidItems = (items ?? []).flatMap((item) => {
		const featureId = item.feature_id;
		if (
			item.usage_model !== UsageModel.Prepaid ||
			!featureId ||
			featureIds.has(featureId)
		) {
			return [];
		}

		featureIds.add(featureId);
		return [{ featureId, item }];
	});
	if (prepaidItems.length === 0) return null;

	return (
		<div className="ml-4 space-y-1 border-l border-border/40 pl-3">
			{prepaidItems.map(({ featureId, item }) => {
				const step = item.billing_units ?? 1;
				return (
					<div key={featureId} className="flex items-center gap-2">
						<div className="min-w-0 flex-1 overflow-hidden">
							<PlanItemLabel currency={currency} item={item} />
						</div>
						<PrepaidQuantityControl
							quantity={quantities[featureId]}
							billingUnits={step}
							readOnly={readOnly}
						>
							{renderField({ featureId, step })}
						</PrepaidQuantityControl>
					</div>
				);
			})}
		</div>
	);
}
