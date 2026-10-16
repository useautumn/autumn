import {
	boldText,
	type FullCusProduct,
	plainText,
	punctuationText,
	type SetPlansPreviewPhase,
	type SetPlansPreviewWarning,
	type SetPlansTextPart,
	type StripeSubscriptionScope,
} from "@autumn/shared";
import { isCustomerProductInStripeSubscriptionScope } from "../subscriptionScope/isCustomerProductInStripeSubscriptionScope";
import { isUnbilledByStripe } from "../utils/isUnbilledByStripe";
import { warningText } from "./warningText";

const joinedNames = (names: string[]): SetPlansTextPart[] =>
	names.flatMap((name, index) => [
		...(index === 0
			? []
			: [index === names.length - 1 ? plainText("and") : punctuationText(",")]),
		boldText(name),
	]);

/** Paid plans no subscription bills that the immediate phase keeps: saving bills them on the targeted one. */
export const unbilledPlansAddedWarnings = ({
	stripeSubscriptionScope,
	customerProducts,
	immediatePhase,
	now,
}: {
	stripeSubscriptionScope?: StripeSubscriptionScope;
	customerProducts: FullCusProduct[];
	immediatePhase?: SetPlansPreviewPhase;
	now: number;
}): Omit<SetPlansPreviewWarning, "severity">[] => {
	if (!stripeSubscriptionScope || !immediatePhase) return [];

	const keptPlans = immediatePhase.plans.filter(
		(plan) => plan.status !== "ends",
	);
	const names = [
		...new Set(
			customerProducts
				.filter(
					(customerProduct) =>
						isCustomerProductInStripeSubscriptionScope({
							stripeSubscriptionScope,
							customerProduct,
						}) &&
						isUnbilledByStripe({ customerProduct, now }) &&
						keptPlans.some(
							(plan) =>
								plan.plan_id === customerProduct.product.id &&
								(plan.entity_id ?? null) ===
									(customerProduct.entity_id ?? null),
						),
				)
				.map((customerProduct) => customerProduct.product.name),
		),
	];
	if (names.length === 0) return [];

	return [
		{
			type: "unbilled_plans_added",
			...warningText([
				...joinedNames(names),
				plainText(
					names.length === 1
						? "isn't billed on any subscription. Saving adds it to this subscription."
						: "aren't billed on any subscription. Saving adds them to this subscription.",
				),
			]),
		},
	];
};
