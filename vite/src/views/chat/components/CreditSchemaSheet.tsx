import type {
	ApiCreditSchemaItem,
	ApiFeatureV1,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { Infinite } from "@autumn/shared";
import { Sheet, SheetContent, SheetTitle } from "@autumn/ui";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";

export type ResolvedFeature = {
	name: string;
	type?: FeatureType;
	usageType?: FeatureUsageType;
};

export type ResolveFeature = (featureId: string) => ResolvedFeature;

const creditsLabel = (creditCost: number) =>
	`${creditCost} ${creditCost === 1 ? "credit" : "credits"}`;

const perUnitsLabel = (billingUnits: number | undefined) =>
	billingUnits && billingUnits !== 1
		? `per ${billingUnits.toLocaleString()} units`
		: "per unit";

const CreditRate = ({ item }: { item: ApiCreditSchemaItem }) => {
	const perUnits = (
		<span className="text-tertiary-foreground text-xs">
			{perUnitsLabel(item.billing_units)}
		</span>
	);

	if (item.tier_behavior !== "graduated") {
		return (
			<div className="flex shrink-0 items-baseline gap-1">
				<span className="font-semibold text-foreground text-sm tabular-nums">
					{creditsLabel(item.credit_cost)}
				</span>
				{perUnits}
			</div>
		);
	}

	return (
		<div className="flex shrink-0 flex-col items-end gap-0.5">
			{item.tiers.map((tier) => (
				<div
					className="flex items-baseline gap-1.5"
					key={`${tier.to}-${tier.credit_cost}`}
				>
					<span className="text-tertiary-foreground text-xs tabular-nums">
						up to {tier.to === Infinite ? "∞" : tier.to.toLocaleString()}
					</span>
					<span className="font-semibold text-foreground text-sm tabular-nums">
						{creditsLabel(tier.credit_cost)}
					</span>
				</div>
			))}
			{perUnits}
		</div>
	);
};

/** One feature's entry in the rate card. */
const SchemaRow = ({
	item,
	resolveFeature,
}: {
	item: ApiCreditSchemaItem;
	resolveFeature: ResolveFeature;
}) => {
	const resolved = resolveFeature(item.metered_feature_id);
	const config = getFeatureIconConfig(resolved.type, resolved.usageType, 16);

	return (
		<div className="flex items-center justify-between gap-4 py-3">
			<div className="flex min-w-0 items-center gap-2.5">
				<span className={config.color}>{config.icon}</span>
				<div className="flex min-w-0 flex-col">
					<span className="truncate text-foreground text-sm">
						{resolved.name}
					</span>
					<span className="truncate font-mono text-[11px] text-tertiary-foreground">
						{item.metered_feature_id}
					</span>
				</div>
			</div>
			<CreditRate item={item} />
		</div>
	);
};

/** Read-only view of a credit system's rate card — what each metered feature
 * costs from the shared pool. Opened from the catalog preview. */
export function CreditSchemaSheet({
	feature,
	onOpenChange,
	open,
	resolveFeature,
}: {
	feature: ApiFeatureV1;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	resolveFeature: ResolveFeature;
}) {
	const config = getFeatureIconConfig(feature.type, undefined, 18);
	const schema = feature.credit_schema ?? [];

	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent className="flex flex-col gap-0 bg-background sm:max-w-md">
				<div className="overflow-y-auto p-5">
					<div className="flex items-center gap-2.5">
						<span className={config.color}>{config.icon}</span>
						<SheetTitle>{feature.name}</SheetTitle>
					</div>
					<p className="mt-1 font-mono text-tertiary-foreground text-xs">
						{feature.id}
					</p>

					<p className="mt-4 text-sm text-tertiary-foreground">
						Usage of each feature draws this many credits from the pool.
					</p>

					<div className="mt-2 divide-y divide-border">
						{schema.map((item) => (
							<SchemaRow
								item={item}
								key={item.metered_feature_id}
								resolveFeature={resolveFeature}
							/>
						))}
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
