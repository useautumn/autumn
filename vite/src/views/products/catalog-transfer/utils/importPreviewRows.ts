import {
	type ApiPlanV1,
	type CatalogFeatureUpdatePreview,
	type CatalogPlanUpdatePreview,
	type CatalogRewardUpdatePreview,
	formatAmount,
	formatInterval,
	type PlanItemChangeV0,
	type PreviewUpdateCatalogResponse,
	type UpdateCatalogParamsInput,
} from "@autumn/shared";

export type ImportPreviewKind = "plans" | "features" | "rewards";

type ImportPreviewAction = CatalogPlanUpdatePreview["action"];

export type ImportPreviewRow = {
	key: string;
	kind: ImportPreviewKind;
	action: ImportPreviewAction;
	name: string;
	id: string;
	badges: string[];
	summary: string;
	changed: boolean;
	plan?: CatalogPlanUpdatePreview;
	feature?: CatalogFeatureUpdatePreview;
	reward?: CatalogRewardUpdatePreview;
};

export type ImportPreviewFilter = {
	action: "all" | "create" | "update";
	kind: ImportPreviewKind | "all";
};

const plural = (count: number, singular: string) =>
	`${count} ${singular}${count === 1 ? "" : "s"}`;

const amountText = (price: ApiPlanV1["price"]) =>
	price
		? formatAmount({
				amount: price.amount,
				amountFormatOptions: {
					currencyDisplay: "narrowSymbol",
					maximumFractionDigits: 10,
				},
			})
		: "Free";

const priceSummary = (plan: CatalogPlanUpdatePreview): string | null => {
	const change = plan.plan_change?.price_change;
	if (!change) return null;
	if (change.previous)
		return `Price ${amountText(change.previous)} → ${amountText(change.current)}`;
	if (!change.current) return null;
	const interval = formatInterval({
		interval: change.current.interval,
		intervalCount: change.current.interval_count,
	});
	return [amountText(change.current), interval].filter(Boolean).join(" ");
};

const changedVariants = (plan: CatalogPlanUpdatePreview) =>
	(plan.variants ?? []).filter(
		(variant) =>
			variant.variant_action === "explicit" ||
			variant.variant_action === "propagated" ||
			Boolean(variant.plan_change),
	);

const planSummary = (plan: CatalogPlanUpdatePreview): string => {
	const items: PlanItemChangeV0[] = plan.plan_change?.item_changes ?? [];
	const added = items.filter((item) => item.action === "created").length;
	const removed = items.filter((item) => item.action === "deleted").length;
	const licenses = plan.plan_change?.license_changes?.length ?? 0;
	const variants = changedVariants(plan).length;
	const settings = Object.keys(
		plan.plan_change?.previous_attributes ?? {},
	).length;
	const created = plan.action === "create";
	return [
		priceSummary(plan),
		added > 0 &&
			(created ? plural(added, "item") : `+${plural(added, "item")}`),
		removed > 0 && `−${plural(removed, "item")}`,
		licenses > 0 && plural(licenses, "license"),
		variants > 0 && plural(variants, "variant"),
		!created && settings > 0 && plural(settings, "setting"),
	]
		.filter(Boolean)
		.join(" · ");
};

const attributesSummary = (
	previous: Record<string, unknown> | null | undefined,
) => {
	const keys = Object.keys(previous ?? {});
	return keys.length > 0 ? `${keys.join(", ")} changed` : "";
};

const planIdsOfLicenses = (request: UpdateCatalogParamsInput) =>
	new Set(
		(request.plans ?? []).flatMap((plan) =>
			(plan.licenses ?? []).map((license) => license.license_plan_id),
		),
	);

const planRows = ({
	plans,
	request,
}: {
	plans: CatalogPlanUpdatePreview[];
	request: UpdateCatalogParamsInput;
}): ImportPreviewRow[] => {
	const licenseIds = planIdsOfLicenses(request);
	const versionCounts = new Map<string, number>();
	for (const plan of plans)
		versionCounts.set(plan.plan_id, (versionCounts.get(plan.plan_id) ?? 0) + 1);

	return plans.map((plan, index) => {
		const requestPlan = request.plans?.find(
			(candidate) =>
				candidate.plan_id === plan.plan_id &&
				(candidate.version_slug ?? plan.version_slug) === plan.version_slug,
		);
		const isVersioned = (versionCounts.get(plan.plan_id) ?? 0) > 1;
		const badges = [
			isVersioned && plan.version_slug,
			licenseIds.has(plan.plan_id) && "License",
			requestPlan?.add_on && "Add-on",
		].filter((badge): badge is string => Boolean(badge));
		return {
			key: `plan:${plan.plan_id}@${plan.version_slug}:${index}`,
			kind: "plans",
			action: plan.action,
			name: plan.name ?? requestPlan?.name ?? plan.plan_id,
			id: plan.plan_id,
			badges,
			summary: planSummary(plan),
			changed: plan.action !== "none" || changedVariants(plan).length > 0,
			plan,
		};
	});
};

/** One row per preview entry, plans first, in the order the request states them. */
export const buildImportPreviewRows = ({
	preview,
	request,
}: {
	preview: PreviewUpdateCatalogResponse;
	request: UpdateCatalogParamsInput;
}): ImportPreviewRow[] => [
	...planRows({ plans: preview.plans, request }),
	...preview.features.map(
		(feature): ImportPreviewRow => ({
			key: `feature:${feature.feature_id}`,
			kind: "features",
			action: feature.action,
			name: feature.name ?? feature.feature_id,
			id: feature.feature_id,
			badges: [],
			summary: attributesSummary(feature.previous_attributes),
			changed: feature.action !== "none",
			feature,
		}),
	),
	...(preview.rewards ?? []).map(
		(reward): ImportPreviewRow => ({
			key: `reward:${reward.id}`,
			kind: "rewards",
			action: reward.action,
			name: reward.name ?? reward.id,
			id: reward.id,
			badges: [reward.kind === "coupon" ? "Coupon" : "Feature grant"],
			summary: attributesSummary(reward.previous_attributes),
			changed: reward.action !== "none",
			reward,
		}),
	),
	...(preview.referral_programs ?? []).map(
		(program): ImportPreviewRow => ({
			key: `referral:${program.id}`,
			kind: "rewards",
			action: program.action,
			name: program.id,
			id: program.id,
			badges: ["Referral program"],
			summary: attributesSummary(program.previous_attributes),
			changed: program.action !== "none",
		}),
	),
];

export const matchesImportPreviewFilter = ({
	row,
	filter,
}: {
	row: ImportPreviewRow;
	filter: ImportPreviewFilter;
}) =>
	(filter.action === "all" || row.action === filter.action) &&
	(filter.kind === "all" || row.kind === filter.kind);
