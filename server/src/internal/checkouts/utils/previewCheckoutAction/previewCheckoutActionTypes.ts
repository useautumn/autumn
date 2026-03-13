import type {
	AttachBillingContext,
	AttachParamsV1,
	AttachPreviewResponse,
	Checkout,
	PreviewUpdateSubscriptionResponse,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { CheckoutAction } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

type BaseCheckoutForAction<TAction extends CheckoutAction, TParams> = Omit<
	Checkout,
	"action" | "params"
> & {
	action: TAction;
	params: TParams;
};

export type CheckoutActionTypeMap = {
	[CheckoutAction.Attach]: {
		checkout: BaseCheckoutForAction<CheckoutAction.Attach, AttachParamsV1>;
		params: AttachParamsV1;
		billingContext: AttachBillingContext;
		preview: AttachPreviewResponse;
	};
	[CheckoutAction.UpdateSubscription]: {
		checkout: BaseCheckoutForAction<
			CheckoutAction.UpdateSubscription,
			UpdateSubscriptionV1Params
		>;
		params: UpdateSubscriptionV1Params;
		billingContext: UpdateSubscriptionBillingContext;
		preview: PreviewUpdateSubscriptionResponse;
	};
};

export type CheckoutForAction<TAction extends CheckoutAction> =
	CheckoutActionTypeMap[TAction]["checkout"];

export type CheckoutParamsForAction<TAction extends CheckoutAction> =
	CheckoutActionTypeMap[TAction]["params"];

export type CheckoutBillingContextForAction<TAction extends CheckoutAction> =
	CheckoutActionTypeMap[TAction]["billingContext"];

export type CheckoutPreviewForAction<TAction extends CheckoutAction> =
	CheckoutActionTypeMap[TAction]["preview"];

export type PreviewCheckoutActionResult<TAction extends CheckoutAction> = {
	billingContext: CheckoutBillingContextForAction<TAction>;
	preview: CheckoutPreviewForAction<TAction>;
};

export type PreviewCheckoutActionArgs<TAction extends CheckoutAction> = {
	ctx: AutumnContext;
	checkout: CheckoutForAction<TAction>;
	params: CheckoutParamsForAction<TAction>;
};

export type PreviewCheckoutAnyActionArgs = {
	ctx: AutumnContext;
	checkout: Checkout;
	params: AttachParamsV1 | UpdateSubscriptionV1Params;
};

export type PreviewCheckoutAnyActionResult =
	| PreviewCheckoutActionResult<CheckoutAction.Attach>
	| PreviewCheckoutActionResult<CheckoutAction.UpdateSubscription>;
