import type {
	FullCusProduct,
	FullCustomer,
	OngoingCusProductAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { buildSubItemUpdate } from "../../../billingUtils/stripeAdapter/buildSubItems/buildSubItemUpdate";
import type { StripeSubAction } from "../../types";

export const buildStripeSubAction = ({
	ctx,
	stripeSub,
	fullCus,
	paymentMethod,
	ongoingCusProductAction,
	newCusProducts,
}: {
	ctx: AutumnContext;
	stripeSub: Stripe.Subscription;
	fullCus: FullCustomer;
	paymentMethod?: Stripe.PaymentMethod;
	ongoingCusProductAction?: OngoingCusProductAction;
	newCusProducts: FullCusProduct[];
}): StripeSubAction => {
	// const { stripeSub } = attachContext;

	const ongoingCusProduct = ongoingCusProductAction?.cusProduct;

	// Build sub item update (what items should be on the sub after this operation)
	const subItemUpdate = buildSubItemUpdate({
		ctx,
		fullCus,
		stripeSub,
		paymentMethod,
		ongoingCusProduct,
		newCusProducts,
	});

	const hasNewItems = subItemUpdate.some((item) => !item.deleted);
	const currentSubItems = stripeSub?.items.data ?? [];

	// 1. If subItems update is empty, no update:
	if (subItemUpdate.length === 0) {
		return { type: "none" };
	}

	// Case 4: Ongoing action is 'cancel' → cancel at period end
	if (ongoingCusProductAction?.action === "cancel") {
		return {
			type: "cancel_at_period_end",
			subId: stripeSub!.id,
			items: subItemUpdate,
		};
	}

	// Case 1: New items but no existing sub → create
	if (hasNewItems && !stripeSub) {
		return {
			type: "create",
			items: subItemUpdate.map((item) => ({
				price: item.price,
				quantity: item.quantity,
			})),
		};
	}

	// Case 2: New items and existing sub → update
	if (hasNewItems && stripeSub) {
		return {
			type: "update",
			subId: stripeSub.id,
			items: subItemUpdate,
		};
	}

	// Case 3: No new items but existing sub has items → cancel immediately
	if (!hasNewItems && currentSubItems.length > 0 && stripeSub) {
		return {
			type: "cancel_immediately",
			subId: stripeSub.id,
		};
	}

	return { type: "none" };
};
