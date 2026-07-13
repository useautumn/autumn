import {
	type ApiPlanV1,
	type BillingInterval,
	type CatalogFeaturePreview,
	type CatalogPlanPreview,
	type CatalogPreviewUpdateResponse,
	type CatalogUpdateParams,
	type Feature,
	FeatureUsageType,
	formatAmount,
	formatInterval,
	getPlanDisplay,
	type PlanItemDisplayFeature,
	type PlanUpdatePreviewVariant,
	type PlanUpdatePreviewVariantConflict,
} from "@autumn/shared";
import { Badge } from "@autumn/ui";
import { GitForkIcon, UsersIcon, WarningIcon } from "@phosphor-icons/react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";
import { conflictSentence } from "@/views/products/plan/versioning/variantConflicts";
import type { ResolvedFeature, ResolveFeature } from "./CreditSchemaSheet";
import { CreditSystemRow, isCreditSystem } from "./CreditSystemRow";
import { PlanDiffBody } from "./PlanDiffBody";
import { PlanPreviewCard, PlansBackdrop } from "./PlanPreviewCard";

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

const catalogRequestFromParams = (
	params?: Record<string, unknown> | null,
): Partial<CatalogUpdateParams> => {
	const record = asRecord(params);
	const request = asRecord(record?.request) ?? record;
	return (request ?? {}) as Partial<CatalogUpdateParams>;
};

const plural = (
	count: number,
	singular: string,
	pluralLabel = `${singular}s`,
) => `${count} ${count === 1 ? singular : pluralLabel}`;

const actionLabel = (action: string | undefined, archive?: boolean) => {
	if (archive) return "Archive";
	if (action === "created" || action === "create") return "Create";
	if (action === "updated" || action === "update") return "Update";
	if (action === "deleted" || action === "remove") return "Remove";
	if (action === "skipped") return "Skipped";
	return "No changes";
};

const actionTone = (action: string | undefined, blocked?: boolean) => {
	if (blocked || action === "skipped")
		return "text-amber-600 dark:text-amber-500";
	if (action === "deleted" || action === "remove") {
		return "text-red-600 dark:text-red-500";
	}
	if (action === "none") return "text-tertiary-foreground";
	return "text-green-600 dark:text-green-500";
};

const planName = (plan: CatalogPlanPreview) => plan.plan?.name ?? plan.plan_id;

const uniqueLatestVariants = (variants: PlanUpdatePreviewVariant[]) => {
	const byId = new Map<string, PlanUpdatePreviewVariant>();
	for (const variant of variants) {
		const existing = byId.get(variant.plan_id);
		if (!existing || variant.version > existing.version) {
			byId.set(variant.plan_id, variant);
		}
	}
	return [...byId.values()];
};

const isBareAmount = (value: string) =>
	/^-?[\d,]+(?:\.\d+)?$/.test(value.trim());

const requestFeatureToDisplayFeature = (
	feature: NonNullable<CatalogUpdateParams["features"]>[number],
): PlanItemDisplayFeature => ({
	display: feature.display,
	id: feature.feature_id,
	name: feature.name ?? feature.feature_id,
	type: feature.type,
});

const mergeDisplayFeatures = ({
	orgFeatures,
	requestFeatures,
}: {
	orgFeatures: Feature[];
	requestFeatures?: CatalogUpdateParams["features"];
}) => {
	const byId = new Map<string, PlanItemDisplayFeature>();
	for (const feature of orgFeatures) {
		byId.set(feature.id, feature);
	}
	for (const feature of requestFeatures ?? []) {
		byId.set(feature.feature_id, requestFeatureToDisplayFeature(feature));
	}
	return [...byId.values()];
};

const featureDisplayName = (
	features: PlanItemDisplayFeature[],
	featureId: string,
) => {
	const feature = features.find((candidate) => candidate.id === featureId);
	return feature?.display?.plural ?? feature?.name ?? featureId;
};

const variantSourceLabel = (variant: PlanUpdatePreviewVariant) => {
	if (variant.update_source === "direct") return "Direct";
	if (variant.update_source === "propagated") return "Propagated";
	return variant.will_apply ? "Included" : "Skipped";
};

/** Split primary/secondary — `PlanPreviewCard` renders the interval itself,
 * so a combined "$50/month" primary would show "$50/month per month". */
const basePriceDisplay = (price: {
	amount: number;
	interval: BillingInterval;
	interval_count?: number;
}) => ({
	primary_text: formatAmount({
		amount: price.amount,
		amountFormatOptions: {
			currencyDisplay: "narrowSymbol",
			maximumFractionDigits: 10,
		},
	}),
	secondary_text: formatInterval({
		interval: price.interval,
		intervalCount: price.interval_count,
	}),
});

/** `catalog.preview_update` doesn't expand `plan` for a newly-created plan
 * unless asked, so reconstruct the resolved plan from the original request
 * params for `PlanPreviewCard`'s pricing-card rendering. */
const apiPlanFromRequest = ({
	features,
	plan,
}: {
	features: PlanItemDisplayFeature[];
	plan: NonNullable<CatalogUpdateParams["plans"]>[number];
}): ApiPlanV1 => {
	const display = getPlanDisplay({ features, plan });
	return {
		add_on: Boolean(plan.add_on),
		archived: false,
		auto_enable: Boolean(plan.auto_enable),
		base_variant_id: null,
		billing_controls: plan.billing_controls,
		config: plan.config ?? { ignore_past_due: false },
		created_at: 0,
		customer_eligibility: plan.customer_eligibility,
		description: plan.description ?? null,
		env: "sandbox",
		free_trial: plan.free_trial,
		group: plan.group ?? null,
		id: plan.plan_id,
		items: (plan.items ?? []).map(
			(item: NonNullable<typeof plan.items>[number], index: number) => {
				const itemDisplay = display.items[index];
				const primaryText =
					item.display?.primary_text ??
					itemDisplay?.primaryText ??
					item.feature_id;
				const resolvedPrimaryText = isBareAmount(primaryText)
					? `${primaryText.trim()} ${featureDisplayName(features, item.feature_id)}`
					: primaryText;
				return {
					...item,
					display: {
						...item.display,
						primary_text: resolvedPrimaryText,
						secondary_text:
							item.display?.secondary_text ?? itemDisplay?.secondaryText,
					},
				};
			},
		),
		metadata: plan.metadata ?? {},
		name: plan.name,
		price: plan.price
			? {
					...plan.price,
					display: plan.price.display ?? basePriceDisplay(plan.price),
				}
			: null,
		variant_details: plan.variant_details,
		version: 1,
	};
};

type RequestVariant = NonNullable<
	NonNullable<CatalogUpdateParams["plans"]>[number]["variants"]
>[number];

/** A requested variant as its own pricing card: the base plan with the
 * variant's identity and customize patch (price override) applied. */
const apiPlanFromRequestVariant = ({
	basePlan,
	variant,
}: {
	basePlan: ApiPlanV1;
	variant: RequestVariant;
}): ApiPlanV1 => {
	const price = variant.customize?.price;
	return {
		...basePlan,
		id: variant.variant_plan_id,
		name: variant.name ?? variant.variant_plan_id,
		price: price
			? { ...price, display: basePriceDisplay(price) }
			: basePlan.price,
		variant_details: { base_plan_id: basePlan.id },
	};
};

const FeatureRow = ({ entry }: { entry: CatalogFeaturePreview }) => {
	const { action, blocked, blocked_reason, feature, feature_id, will_archive } =
		entry;
	const id = feature_id ?? feature?.id ?? "feature";
	const config = getFeatureIconConfig(
		feature?.type,
		feature?.consumable === false ? FeatureUsageType.Continuous : undefined,
	);
	const label = feature?.name ?? id;
	return (
		<div className="flex flex-col gap-1 px-3 py-2">
			<div className="flex items-center gap-2.5">
				<span className={config.color} title={config.label}>
					{config.icon}
				</span>
				<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
					{label}
				</span>
				<span className="font-mono text-tertiary-foreground text-xs">{id}</span>
				<span className={cn("shrink-0 text-xs", actionTone(action, blocked))}>
					{actionLabel(action, will_archive)}
				</span>
			</div>
			{blocked && blocked_reason && (
				<span className="text-amber-600 text-xs dark:text-amber-500">
					Skipped: {blocked_reason.replaceAll("_", " ")}
				</span>
			)}
		</div>
	);
};

/** Only reflect what THIS request will do: the preview's `migration` field
 * means a draft *could* be created; show it only when the params ask for one.
 * In-place updates without a draft leave customers where they are — say so. */
function MigrationSummary({
	plan,
	requestPlan,
}: {
	plan: CatalogPlanPreview;
	requestPlan?: CatalogUpdateParams["plans"] extends (infer P)[] | undefined
		? P
		: never;
}) {
	const draftRequested = Boolean(
		(requestPlan?.migration as { draft?: boolean } | undefined)?.draft,
	);
	const inPlace = Boolean(
		requestPlan?.disable_version || requestPlan?.all_versions,
	);
	if (draftRequested) {
		// The backfilled preview doesn't always include the migration block, but
		// the request is the truth: a draft WILL be created.
		const copy = plan.migration?.has_billing_changes
			? "A migration draft will be created — it moves existing customers and may change billing."
			: "A migration draft will be created — it moves existing customers onto the new plan shape.";
		return (
			<InfoBox classNames={{ infoBox: "max-w-xl" }} variant="warning">
				{copy} Review and run it separately
				{plan.migration
					? ` — targets ${plural(plan.migration.plan_ids.length, "plan")}.`
					: "."}
			</InfoBox>
		);
	}
	if (inPlace && (plan.customer_count ?? 0) > 0) {
		return (
			<span className="text-tertiary-foreground text-xs">
				Existing {plural(plan.customer_count, "customer")} stay on their current
				version — no migration will run.
			</span>
		);
	}
	return null;
}

function ConflictList({
	conflicts,
}: {
	conflicts: PlanUpdatePreviewVariantConflict[];
}) {
	if (conflicts.length === 0) return null;
	return (
		<div className="flex flex-col gap-1">
			{conflicts.map((conflict, index) => (
				<span
					className="text-amber-600 text-xs dark:text-amber-500"
					key={`${conflict.reason}-${index}`}
				>
					{conflictSentence(conflict)}
				</span>
			))}
		</div>
	);
}

function VariantRow({
	featuresById,
	variant,
}: {
	featuresById: Map<string, Feature>;
	variant: PlanUpdatePreviewVariant;
}) {
	const conflicts = variant.conflicts ?? [];
	const source = variantSourceLabel(variant);
	return (
		<div className="flex flex-col gap-1.5 rounded-md bg-secondary/40 px-2.5 py-2">
			<div className="flex items-center gap-2">
				<GitForkIcon className="size-3.5 text-tertiary-foreground" />
				<span className="min-w-0 flex-1 truncate font-medium text-foreground text-xs">
					{variant.name}
				</span>
				<Badge size="sm" variant="muted">
					v{variant.version}
				</Badge>
				<Badge size="sm" variant="muted">
					{source}
				</Badge>
				{variant.customer_count > 0 && (
					<span className="flex items-center gap-1 text-tertiary-foreground text-xs">
						<UsersIcon size={11} />
						{variant.customer_count}
					</span>
				)}
				{conflicts.length > 0 && (
					<span className="flex items-center gap-1 text-amber-600 text-xs dark:text-amber-500">
						<WarningIcon size={11} weight="fill" />
						{conflicts.length}
					</span>
				)}
			</div>
			<PlanDiffBody features={[...featuresById.values()]} plan={variant} />
			<ConflictList conflicts={conflicts} />
		</div>
	);
}

function VariantSummary({
	featuresById,
	variants,
}: {
	featuresById: Map<string, Feature>;
	variants: PlanUpdatePreviewVariant[];
}) {
	// Candidates the user didn't select must not render as if they'll change —
	// `will_apply` is the truth (direct variant updates always apply).
	const latest = uniqueLatestVariants(variants).filter(
		(variant) => variant.will_apply || variant.update_source === "direct",
	);
	if (latest.length === 0) return null;
	const directCount = latest.filter((v) => v.update_source === "direct").length;
	const propagatedCount = latest.filter(
		(v) => v.update_source === "propagated",
	).length;
	const conflictCount = latest.reduce(
		(sum, variant) => sum + (variant.conflicts?.length ?? 0),
		0,
	);
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex flex-wrap items-center gap-1.5 text-xs">
				<span className="font-medium text-tertiary-foreground">Variants</span>
				{directCount > 0 && (
					<Badge size="sm" variant="muted">
						{plural(directCount, "direct")}
					</Badge>
				)}
				{propagatedCount > 0 && (
					<Badge size="sm" variant="muted">
						{plural(propagatedCount, "propagated")}
					</Badge>
				)}
				{conflictCount > 0 && (
					<span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
						<WarningIcon size={11} weight="fill" />
						{plural(conflictCount, "conflict")}
					</span>
				)}
			</div>
			<div className="flex flex-col gap-1.5">
				{latest.slice(0, 4).map((variant) => (
					<VariantRow
						featuresById={featuresById}
						key={variant.plan_id}
						variant={variant}
					/>
				))}
				{latest.length > 4 && (
					<span className="px-1 text-tertiary-foreground text-xs">
						+{latest.length - 4} more variants
					</span>
				)}
			</div>
		</div>
	);
}

function PlanChangeRow({
	featuresById,
	plan,
	requestPlan,
}: {
	featuresById: Map<string, Feature>;
	plan: CatalogPlanPreview;
	requestPlan?: NonNullable<CatalogUpdateParams["plans"]>[number];
}) {
	const createsVersion = plan.versionable || plan.migration !== undefined;
	const customerCount = plan.customer_count ?? 0;
	const name = planName(plan);
	return (
		<div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="truncate font-medium text-foreground text-sm">
						{name}
					</span>
					{name !== plan.plan_id && (
						<span className="truncate font-mono text-tertiary-foreground text-xs">
							{plan.plan_id}
						</span>
					)}
				</div>
				<div className="flex shrink-0 flex-wrap justify-end gap-1.5">
					<Badge size="sm" variant="muted">
						{actionLabel(plan.action, plan.will_archive)}
					</Badge>
					{createsVersion && (
						<Badge size="sm" variant="muted">
							Version
						</Badge>
					)}
					{customerCount > 0 && (
						<span className="flex items-center gap-1 text-tertiary-foreground text-xs">
							<UsersIcon size={11} />
							{customerCount}
						</span>
					)}
				</div>
			</div>
			<MigrationSummary plan={plan} requestPlan={requestPlan} />
			<PlanDiffBody features={[...featuresById.values()]} plan={plan} />
			<VariantSummary
				featuresById={featuresById}
				variants={plan.variants ?? []}
			/>
		</div>
	);
}

function PreviewSummary({
	features,
	plans,
}: {
	features: CatalogFeaturePreview[];
	plans: CatalogPlanPreview[];
}) {
	const changedFeatures = features.filter(
		(feature) => feature.action !== "none",
	);
	const changedPlans = plans.filter(
		(plan) =>
			plan.action !== "none" ||
			(plan.variants ?? []).some(
				(variant: PlanUpdatePreviewVariant) => variant.update_source,
			),
	);
	const variantCount = plans.reduce(
		(sum, plan) =>
			sum +
			uniqueLatestVariants(plan.variants ?? []).filter(
				(variant) => variant.will_apply || variant.update_source === "direct",
			).length,
		0,
	);
	const migrationCount = plans.filter((plan) => plan.migration).length;
	return (
		<div className="flex flex-wrap gap-1.5">
			<Badge size="sm" variant="muted">
				{plural(changedFeatures.length, "feature")}
			</Badge>
			<Badge size="sm" variant="muted">
				{plural(changedPlans.length, "plan")}
			</Badge>
			{variantCount > 0 && (
				<Badge size="sm" variant="muted">
					{plural(variantCount, "variant")}
				</Badge>
			)}
			{migrationCount > 0 && (
				<Badge size="sm" variant="muted">
					{plural(migrationCount, "migration")}
				</Badge>
			)}
		</div>
	);
}

/** Compact catalog preview for chat approvals. It mirrors the update-plan flow:
 * changed fields first, then version/migration impact, then variants. */
export function CatalogPreviewCard({
	params,
	preview,
}: {
	params?: Record<string, unknown> | null;
	preview: CatalogPreviewUpdateResponse;
}) {
	const { features: orgFeatures } = useFeaturesQuery();
	const features = preview.feature_changes ?? [];
	const plans = preview.plan_changes ?? [];
	const request = catalogRequestFromParams(params);
	if (!features.length && !plans.length) return null;

	const featuresById = new Map(
		orgFeatures.map((feature) => [feature.id, feature]),
	);
	const featureMeta = new Map<string, ResolvedFeature>(
		orgFeatures.map((feature) => [
			feature.id,
			{
				name: feature.name,
				type: feature.type,
				usageType: feature.config?.usage_type,
			},
		]),
	);
	for (const entry of features) {
		if (!entry.feature) continue;
		featuresById.set(entry.feature.id, entry.feature as Feature);
		featureMeta.set(entry.feature.id, {
			name: entry.feature.name,
			type: entry.feature.type,
			usageType:
				entry.feature.consumable === false
					? FeatureUsageType.Continuous
					: FeatureUsageType.Single,
		});
	}
	const resolveFeature: ResolveFeature = (featureId) =>
		featureMeta.get(featureId) ?? { name: featureId };

	const createdPlans = plans.filter((plan) => plan.action === "created");
	const changedPlans = plans.filter((plan) => !createdPlans.includes(plan));
	const requestPlansById = new Map(
		(request.plans ?? []).map((plan) => [plan.plan_id, plan]),
	);
	const displayFeatures = mergeDisplayFeatures({
		orgFeatures: [...featuresById.values()],
		requestFeatures: request.features,
	});
	const previewPlan = (entry: CatalogPlanPreview) => {
		if (entry.plan) return entry.plan;
		const requestPlan = requestPlansById.get(entry.plan_id);
		if (!requestPlan) return undefined;
		return apiPlanFromRequest({
			features: displayFeatures,
			plan: requestPlan,
		});
	};

	return (
		<div className="flex w-[620px] max-w-full flex-col gap-3">
			<PreviewSummary features={features} plans={plans} />
			{features.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-tertiary-foreground text-xs">
						Features
					</span>
					<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
						{features.map((entry) =>
							entry.feature && isCreditSystem(entry.feature) ? (
								<CreditSystemRow
									feature={entry.feature}
									key={entry.feature_id}
									resolveFeature={resolveFeature}
								/>
							) : (
								<FeatureRow entry={entry} key={entry.feature_id} />
							),
						)}
					</div>
				</div>
			)}
			{createdPlans.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-tertiary-foreground text-xs">
						New plans
					</span>
					<PlansBackdrop>
						{createdPlans.flatMap((entry) => {
							const plan = previewPlan(entry);
							if (!plan) {
								return (
									<PlanChangeRow
										featuresById={featuresById}
										key={entry.plan_id}
										plan={entry}
									/>
								);
							}
							const requestVariants =
								requestPlansById.get(entry.plan_id)?.variants ?? [];
							return [
								<PlanPreviewCard
									featuresById={featuresById}
									key={entry.plan_id}
									plan={plan}
								/>,
								...requestVariants.map((variant: RequestVariant) => (
									<PlanPreviewCard
										featuresById={featuresById}
										key={variant.variant_plan_id}
										plan={apiPlanFromRequestVariant({
											basePlan: plan,
											variant,
										})}
									/>
								)),
							];
						})}
					</PlansBackdrop>
				</div>
			)}
			{changedPlans.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-tertiary-foreground text-xs">
						Plan changes
					</span>
					<div className="flex flex-col gap-2">
						{changedPlans.map((plan) => (
							<PlanChangeRow
								featuresById={featuresById}
								key={plan.plan_id}
								plan={plan}
								requestPlan={requestPlansById.get(plan.plan_id)}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
