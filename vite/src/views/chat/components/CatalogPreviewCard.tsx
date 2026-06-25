import {
	type ApiPlanItemV1,
	type ApiPlanV1,
	type CatalogFeaturePreview,
	type CatalogPreviewUpdateResponse,
	type Feature,
	FeatureUsageType,
} from "@autumn/shared";
import { Card, CardContent, CardHeader } from "@autumn/ui";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";

const itemPrimaryText = (item: ApiPlanItemV1) =>
	item.display?.primary_text ??
	(item.unlimited ? "Unlimited" : `${item.included} ${item.feature_id}`);

/** One plan item row: feature type icon + the server-resolved display text. */
const PlanItemRow = ({
	feature,
	item,
}: {
	feature?: Feature;
	item: ApiPlanItemV1;
}) => {
	const config = getFeatureIconConfig(
		feature?.type,
		feature?.config?.usage_type,
		14,
	);
	return (
		<div className="flex items-center gap-2 text-xs">
			<span className={config.color}>{config.icon}</span>
			<span className="text-foreground">{itemPrimaryText(item)}</span>
			{item.display?.secondary_text && (
				<span className="text-tertiary-foreground">
					{item.display.secondary_text}
				</span>
			)}
		</div>
	);
};

/** Plan pricing card rendered directly off ApiPlanV1 (no conversion) — the
 * server already resolves each item's display text and the base price. */
const PlanCard = ({
	featuresById,
	plan,
}: {
	featuresById: Map<string, Feature>;
	plan: ApiPlanV1;
}) => {
	const priceText = plan.price?.display?.primary_text ?? "Free";
	const priceSecondary =
		plan.price?.display?.secondary_text ??
		(plan.price?.interval ? `per ${plan.price.interval}` : null);
	return (
		<Card className="flex w-[270px] flex-col gap-0 rounded-xl bg-interactive-secondary dark:bg-background">
			<CardHeader>
				<div className="flex items-center gap-2">
					<span className="font-medium text-foreground text-sm">
						{plan.name || plan.id}
					</span>
					{plan.auto_enable && (
						<span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-tertiary-foreground">
							Auto-enable
						</span>
					)}
				</div>
				<div className="flex items-baseline gap-1 pt-1">
					<span className="font-semibold text-foreground text-lg">
						{priceText}
					</span>
					{priceSecondary && (
						<span className="text-tertiary-foreground text-xs">
							{priceSecondary}
						</span>
					)}
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-1.5 pt-1">
				{plan.items.map((item) => (
					<PlanItemRow
						key={item.feature_id}
						feature={featuresById.get(item.feature_id)}
						item={item}
					/>
				))}
			</CardContent>
		</Card>
	);
};

/** One feature as a list row: type icon (hover for the type label) + name + id,
 * with the type label trailing — mirrors the Features table. */
const FeatureRow = ({ entry }: { entry: CatalogFeaturePreview }) => {
	const { feature, blockers } = entry;
	const config = getFeatureIconConfig(
		feature.type,
		feature.consumable === false ? FeatureUsageType.Continuous : undefined,
	);
	return (
		<div className="flex flex-col gap-1 px-3 py-2">
			<div className="flex items-center gap-2.5">
				<span className={config.color} title={config.label}>
					{config.icon}
				</span>
				<span className="font-medium text-foreground text-sm">
					{feature.name}
				</span>
				<span className="font-mono text-tertiary-foreground text-xs">
					{feature.id}
				</span>
				<span className="ml-auto text-tertiary-foreground text-xs">
					{config.label}
				</span>
			</div>
			{blockers?.map((blocker) => (
				<span
					key={blocker.code}
					className="text-red-600 text-xs dark:text-red-500"
				>
					{blocker.message}
				</span>
			))}
		</div>
	);
};

/** The proposed catalog change, rendered inline in the chat. Features are a
 * compact list; plans are pricing cards on a dotted backdrop. */
export function CatalogPreviewCard({
	preview,
}: {
	preview: CatalogPreviewUpdateResponse;
}) {
	const { features: orgFeatures } = useFeaturesQuery();
	const features = preview.features ?? [];
	const plans = preview.plans ?? [];
	if (!features.length && !plans.length) return null;

	// Feature types power the per-item icons (the item itself only carries the
	// feature id + server-resolved display text).
	const featuresById = new Map(
		orgFeatures.map((feature) => [feature.id, feature]),
	);

	return (
		<div className="flex flex-col gap-3">
			{features.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-tertiary-foreground text-xs">
						Features
					</span>
					<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
						{features.map((entry) => (
							<FeatureRow key={entry.feature.id} entry={entry} />
						))}
					</div>
				</div>
			)}
			{plans.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-tertiary-foreground text-xs">
						Plans
					</span>
					<div
						className="flex flex-wrap justify-center gap-2 rounded-xl border border-border/50 bg-card p-3 [--dot-color:rgba(0,0,0,0.15)] dark:[--dot-color:rgba(255,255,255,0.12)]"
						style={{
							backgroundImage:
								"radial-gradient(circle, var(--dot-color) 1px, transparent 1px)",
							backgroundSize: "16px 16px",
						}}
					>
						{plans.map((plan) => (
							<PlanCard key={plan.id} featuresById={featuresById} plan={plan} />
						))}
					</div>
				</div>
			)}
		</div>
	);
}
