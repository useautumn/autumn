import type { ApiPlanItemV1, Feature } from "@autumn/shared";
import { Sheet, SheetContent, SheetTitle } from "@autumn/ui";
import type { ReactNode } from "react";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";

const ConfigRow = ({ label, value }: { label: string; value: ReactNode }) =>
	value == null || value === "" ? null : (
		<div className="flex items-center justify-between gap-4 border-border border-b py-2.5 last:border-0">
			<span className="text-sm text-tertiary-foreground">{label}</span>
			<span className="text-foreground text-sm">{value}</span>
		</div>
	);

const priceText = (price: ApiPlanItemV1["price"]) => {
	if (!price) return null;
	if (price.tiers?.length) return "Tiered";
	return price.amount == null
		? null
		: `$${price.amount}${price.interval ? ` / ${price.interval}` : ""}`;
};

/** Read-only view of a plan item's config, opened from the catalog preview card.
 * Driven straight off ApiPlanItemV1 — no editing, no plan-editor context. */
export function PlanItemSheet({
	feature,
	item,
	onOpenChange,
	open,
}: {
	feature?: Feature;
	item: ApiPlanItemV1;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const config = getFeatureIconConfig(
		feature?.type,
		feature?.config?.usage_type,
		18,
	);
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex flex-col gap-0 bg-background sm:max-w-md">
				<div className="overflow-y-auto p-5">
					<div className="flex items-center gap-2">
						<span className={config.color}>{config.icon}</span>
						<SheetTitle>{feature?.name ?? item.feature_id}</SheetTitle>
					</div>
					<p className="mt-1 font-mono text-tertiary-foreground text-xs">
						{item.feature_id}
					</p>

					<div className="mt-4 flex flex-col">
						<ConfigRow label="Type" value={config.label} />
						<ConfigRow
							label="Included"
							value={item.unlimited ? "Unlimited" : item.included}
						/>
						<ConfigRow
							label="Resets"
							value={
								item.reset?.interval
									? `Every ${item.reset.interval}`
									: "Doesn't reset"
							}
						/>
						<ConfigRow label="Price" value={priceText(item.price)} />
						<ConfigRow
							label="Billing units"
							value={item.price?.billing_units}
						/>
						<ConfigRow
							label="Billing method"
							value={item.price?.billing_method}
						/>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
