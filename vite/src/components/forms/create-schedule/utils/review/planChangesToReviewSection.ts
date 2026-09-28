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
	isImmediatePhase,
	joinDetail,
	phaseLabel,
	summarizeCounts,
	withoutEmptyPhases,
} from "./phaseTiming";
import { splitPriceLabel } from "./splitPriceLabel";
import type {
	ReviewChangePhase,
	ReviewChangeRow,
	ReviewChangeSection,
	ReviewChangeStatus,
	ReviewChangeValue,
} from "./types/reviewChange";

type PlanChangeStatus = Extract<
	ReviewChangeStatus,
	"starts" | "ends" | "updated"
>;

const PLAN_CHANGE_STATUS: Record<
	CustomerPlanChange["action"],
	PlanChangeStatus
> = {
	activated: "starts",
	scheduled: "starts",
	expired: "ends",
	updated: "updated",
};

const CREDIT_DESCRIPTION = "Unused time credited";

type PlanRowContext = {
	products: ProductV2[];
	priceLabelFor: (product: ProductV2) => string;
	phaseTotalFor: (planIds: string[]) => string | undefined;
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
const immediateCredit = ({
	preview,
	planId,
}: {
	preview: SetPlansPreviewResponse;
	planId: string;
}): ReviewChangeValue | undefined => {
	const credit = preview.line_items
		.filter((lineItem: PreviewLineItem) => lineItem.plan_id === planId)
		.reduce(
			(sum: number, lineItem: PreviewLineItem) => sum + lineItem.total,
			0,
		);
	if (credit >= 0) return undefined;

	const amount = formatAmount({
		amount: credit,
		currency: preview.currency,
		minFractionDigits: 2,
		maxFractionDigits: 2,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});
	return { amount, suffix: "credit" };
};

const planChangeExtras = ({
	change,
	status,
}: {
	change: CustomerPlanChange;
	status: PlanChangeStatus;
}) => {
	const expiresAt = change.subscription?.expires_at;
	const endsLater = status === "updated" && expiresAt;

	return [
		change.entity_id ? `Entity ${change.entity_id}` : undefined,
		change.plan_change ? "Custom" : undefined,
		endsLater ? `Ends ${formatPhaseDate({ startsAt: expiresAt })}` : undefined,
	];
};

const productPrice = ({
	product,
	context,
}: {
	product: ProductV2 | undefined;
	context: PlanRowContext;
}) => (product ? splitPriceLabel(context.priceLabelFor(product)) : undefined);

const planChangeToRow = ({
	preview,
	change,
	phaseIndex,
	context,
}: {
	preview: SetPlansPreviewResponse;
	change: CustomerPlanChange;
	phaseIndex: number;
	context: PlanRowContext;
}): ReviewChangeRow => {
	const planId = planChangePlanId(change);
	const product = findProduct({ products: context.products, planId });
	const status = PLAN_CHANGE_STATUS[change.action];
	const credit =
		status === "ends" && isImmediatePhase({ phaseIndex })
			? immediateCredit({ preview, planId })
			: undefined;

	return {
		key: `plan-${phaseIndex}-${planId}-${change.entity_id ?? ""}-${change.action}`,
		title: product?.name ?? planId,
		description: joinDetail([
			credit ? CREDIT_DESCRIPTION : undefined,
			...planChangeExtras({ change, status }),
		]),
		status,
		value: planRowValue({ status, credit, product, context }),
	};
};

/** Ending plans show their credit, if any; live plans show their price. */
const planRowValue = ({
	status,
	credit,
	product,
	context,
}: {
	status: PlanChangeStatus;
	credit: ReviewChangeValue | undefined;
	product: ProductV2 | undefined;
	context: PlanRowContext;
}) => {
	if (status === "ends") return credit;
	return productPrice({ product, context });
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
				title: product?.name ?? planId,
				status: "kept",
				value: productPrice({ product, context }),
			};
		});

type PlanPhase = {
	changeCount: number;
	phase: ReviewChangePhase;
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
	const phases: PlanPhase[] = preview.phases.map(
		(phase: SetPlansPreviewPhase, phaseIndex: number) => {
			const declaredPlanIds = declaredPlanIdsByPhase[phaseIndex] ?? [];
			const changeRows = phase.plan_changes.map((change: CustomerPlanChange) =>
				planChangeToRow({ preview, change, phaseIndex, context }),
			);
			const keptRows = keptPlanRows({
				phaseIndex,
				declaredPlanIds,
				previousPlanIds: isImmediatePhase({ phaseIndex })
					? existingPlanIds
					: (declaredPlanIdsByPhase[phaseIndex - 1] ?? []),
				changedPlanIds: new Set(phase.plan_changes.map(planChangePlanId)),
				context,
			});

			return {
				changeCount: changeRows.length,
				phase: {
					key: `plans-${phaseIndex}`,
					label: phaseLabel({ phaseIndex, startsAt: phase.starts_at }),
					total: context.phaseTotalFor(declaredPlanIds),
					rows: [...changeRows, ...keptRows],
				},
			};
		},
	);

	return {
		phases: withoutEmptyPhases(phases.map(({ phase }) => phase)),
		summary: summarizeCounts({
			counts: phases.map(({ phase, changeCount }, phaseIndex) => [
				isImmediatePhase({ phaseIndex }) ? "now" : `on ${phase.label}`,
				changeCount,
			]),
			emptyLabel: "No changes",
		}),
		stripeIds: [],
	};
};
