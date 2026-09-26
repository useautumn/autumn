import {
	type CustomerPlanChange,
	formatAmount,
	type PreviewLineItem,
	type ProductV2,
	type SetPlansPreviewPhase,
	type SetPlansPreviewResponse,
} from "@autumn/shared";
import {
	formatPhaseDate,
	formatPhaseTiming,
	isImmediatePhase,
	joinDetail,
	summarizeCounts,
} from "./phaseTiming";
import type {
	ReviewChangeRow,
	ReviewChangeSection,
	ReviewChangeTone,
} from "./types/reviewChange";

type PlanChangeKind = "starts" | "ends" | "updated";

const PLAN_CHANGE_KIND: Record<CustomerPlanChange["action"], PlanChangeKind> = {
	activated: "starts",
	scheduled: "starts",
	expired: "ends",
	updated: "updated",
};

const KIND_TONE: Record<PlanChangeKind, ReviewChangeTone> = {
	starts: "new",
	ends: "ending",
	updated: "changed",
};

const KIND_LABEL: Record<PlanChangeKind, string> = {
	starts: "Starts",
	ends: "Ends",
	updated: "Updated",
};

type PlanRowContext = {
	products: ProductV2[];
	priceLabelFor: (product: ProductV2) => string;
};

const planChangePlanId = (change: CustomerPlanChange) =>
	change.subscription?.plan_id ?? change.purchase?.plan_id ?? "";

const findProduct = ({
	products,
	planId,
}: {
	products: ProductV2[];
	planId: string;
}) => products.find((product) => product.id === planId);

/** Net credit on the immediate invoice for a plan that ends now. */
const immediateCreditLabel = ({
	preview,
	planId,
}: {
	preview: SetPlansPreviewResponse;
	planId: string;
}) => {
	const credit = preview.line_items
		.filter((lineItem: PreviewLineItem) => lineItem.plan_id === planId)
		.reduce(
			(sum: number, lineItem: PreviewLineItem) => sum + lineItem.total,
			0,
		);
	if (credit >= 0) return undefined;

	return formatAmount({
		amount: credit,
		currency: preview.currency,
		minFractionDigits: 2,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});
};

const describePlanChange = ({
	change,
	kind,
}: {
	change: CustomerPlanChange;
	kind: PlanChangeKind;
}) => {
	const expiresAt = change.subscription?.expires_at;
	const endsLater = kind === "updated" && expiresAt;

	return joinDetail([
		change.entity_id ? `Entity ${change.entity_id}` : undefined,
		change.plan_change ? "Custom" : undefined,
		endsLater ? `Ends ${formatPhaseDate({ startsAt: expiresAt })}` : undefined,
	]);
};

const planChangeToRow = ({
	preview,
	change,
	phaseIndex,
	startsAt,
	context,
}: {
	preview: SetPlansPreviewResponse;
	change: CustomerPlanChange;
	phaseIndex: number;
	startsAt: number;
	context: PlanRowContext;
}): ReviewChangeRow => {
	const planId = planChangePlanId(change);
	const product = findProduct({ products: context.products, planId });
	const kind = PLAN_CHANGE_KIND[change.action];
	const isEnding = kind === "ends";
	const endsNow = isEnding && isImmediatePhase({ phaseIndex });
	const timing = formatPhaseTiming({ phaseIndex, startsAt });

	return {
		key: `plan-${phaseIndex}-${planId}-${change.entity_id ?? ""}-${change.action}`,
		icon: product?.is_add_on ? "addOn" : "plan",
		title: product?.name ?? planId,
		detail: describePlanChange({ change, kind }),
		tone: KIND_TONE[kind],
		label:
			kind === "updated" ? KIND_LABEL[kind] : `${KIND_LABEL[kind]} ${timing}`,
		value: planRowValue({
			preview,
			planId,
			product,
			isEnding,
			endsNow,
			context,
		}),
		isEnding,
	};
};

/** Ending-now plans show their credit; live plans show their base price. */
const planRowValue = ({
	preview,
	planId,
	product,
	isEnding,
	endsNow,
	context,
}: {
	preview: SetPlansPreviewResponse;
	planId: string;
	product: ProductV2 | undefined;
	isEnding: boolean;
	endsNow: boolean;
	context: PlanRowContext;
}) => {
	if (endsNow) return immediateCreditLabel({ preview, planId });
	if (!product || isEnding) return undefined;
	return context.priceLabelFor(product);
};

/** Declared plans that were already active and have no change in this phase. */
const keptPlanRows = ({
	phaseIndex,
	declaredPlanIds,
	previousPlanIds,
	changedPlanIds,
	context,
}: {
	phaseIndex: number;
	declaredPlanIds: string[];
	previousPlanIds: string[];
	changedPlanIds: Set<string>;
	context: PlanRowContext;
}): ReviewChangeRow[] =>
	declaredPlanIds
		.filter(
			(planId) =>
				previousPlanIds.includes(planId) && !changedPlanIds.has(planId),
		)
		.map((planId) => {
			const product = findProduct({ products: context.products, planId });
			return {
				key: `plan-${phaseIndex}-${planId}-kept`,
				icon: product?.is_add_on ? "addOn" : "plan",
				title: product?.name ?? planId,
				tone: "kept",
				label: "Kept",
				value: product ? context.priceLabelFor(product) : undefined,
			};
		});

type PhasePlanRows = {
	phase: SetPlansPreviewPhase;
	phaseIndex: number;
	changeRows: ReviewChangeRow[];
	keptRows: ReviewChangeRow[];
};

export const planChangesToReviewSection = ({
	preview,
	declaredPlanIdsByPhase,
	existingPlanIds,
	context,
}: {
	preview: SetPlansPreviewResponse;
	declaredPlanIdsByPhase: string[][];
	existingPlanIds: string[];
	context: PlanRowContext;
}): ReviewChangeSection => {
	const phaseRows: PhasePlanRows[] = preview.phases.map(
		(phase: SetPlansPreviewPhase, phaseIndex: number) => {
			const changeRows = phase.plan_changes.map((change: CustomerPlanChange) =>
				planChangeToRow({
					preview,
					change,
					phaseIndex,
					startsAt: phase.starts_at,
					context,
				}),
			);
			const keptRows = keptPlanRows({
				phaseIndex,
				declaredPlanIds: declaredPlanIdsByPhase[phaseIndex] ?? [],
				previousPlanIds: isImmediatePhase({ phaseIndex })
					? existingPlanIds
					: (declaredPlanIdsByPhase[phaseIndex - 1] ?? []),
				changedPlanIds: new Set(phase.plan_changes.map(planChangePlanId)),
				context,
			});
			return { phase, phaseIndex, changeRows, keptRows };
		},
	);

	return {
		rows: phaseRows.flatMap(({ changeRows, keptRows }) => [
			...changeRows,
			...keptRows,
		]),
		summary: summarizeCounts({
			counts: phaseRows.map(({ phase, phaseIndex, changeRows }) => [
				isImmediatePhase({ phaseIndex })
					? "now"
					: `on ${formatPhaseDate({ startsAt: phase.starts_at })}`,
				changeRows.length,
			]),
			emptyLabel: "No changes",
		}),
	};
};
