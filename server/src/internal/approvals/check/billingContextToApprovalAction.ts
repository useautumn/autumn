import type { BillingContext } from "@autumn/shared";
import type { BillingRoute } from "./types/billingRoute";

export type BillingApprovalAction =
	| "billing.attach"
	| "billing.update"
	| "billing.set_plans"
	| "billing.create_schedule"
	| "billing.cancel"
	| "billing.uncancel";

/** An update that cancels or uncancels is judged as that, exactly like its preview. */
const updateToApprovalAction = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): BillingApprovalAction => {
	const { cancelAction } = billingContext;
	if (!cancelAction) return "billing.update";
	return cancelAction === "uncancel" ? "billing.uncancel" : "billing.cancel";
};

export const billingContextToApprovalAction = ({
	billingContext,
	route,
}: {
	billingContext: BillingContext;
	route: BillingRoute;
}): BillingApprovalAction => {
	switch (route) {
		case "billing.attach":
		case "billing.multi_attach":
			return "billing.attach";
		case "billing.update":
		case "billing.multi_update":
			return updateToApprovalAction({ billingContext });
		case "billing.set_plans":
		case "billing.create_schedule":
			return route;
	}
};
