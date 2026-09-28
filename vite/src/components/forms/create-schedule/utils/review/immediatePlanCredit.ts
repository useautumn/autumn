import type {
	CustomerPlanChange,
	PreviewLineItem,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import { formatMoney } from "./formatMoney";
import { planChangePlanId } from "./planChangePlanId";
import type { ReviewChangeValue } from "./types/reviewChange";

const CREDIT_DESCRIPTION = "Unused time credited";

const CREDITED_ACTIONS: CustomerPlanChange["action"][] = ["expired", "updated"];

type PlanCredit = {
	description: string;
	value?: ReviewChangeValue;
};

/**
 * Credit on the immediate invoice for a plan that ends now. Line items carry only a
 * plan id, so a credit shared by several entities' changes is shown as a shared total.
 */
export const immediatePlanCredit = ({
	preview,
	planId,
	immediateChanges,
}: {
	preview: SetPlansPreviewResponse;
	planId: string;
	immediateChanges: CustomerPlanChange[];
}): PlanCredit | undefined => {
	const credit = preview.line_items
		.filter(
			(lineItem: PreviewLineItem) =>
				lineItem.plan_id === planId && lineItem.total < 0,
		)
		.reduce(
			(sum: number, lineItem: PreviewLineItem) => sum + lineItem.total,
			0,
		);
	if (credit >= 0) return undefined;

	const amount = formatMoney({
		amount: credit,
		currency: preview.currency,
		showCents: true,
	});
	const creditedChangeCount = immediateChanges.filter(
		(change) =>
			planChangePlanId(change) === planId &&
			CREDITED_ACTIONS.includes(change.action),
	).length;

	if (creditedChangeCount > 1) {
		return {
			description: `${CREDIT_DESCRIPTION} · ${amount} across ${creditedChangeCount} entities`,
		};
	}
	return {
		description: CREDIT_DESCRIPTION,
		value: { amount, suffix: "credit" },
	};
};
