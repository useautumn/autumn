import type * as operations from "@useautumn/sdk/models/operations";
import type {
	AttachParams,
	BillingPortalParams,
	CancelParams,
	CheckoutParams,
	CheckParams,
	QueryParams,
	SetupPaymentParams,
	TrackParams,
} from "./autumnTypes";
import type { AutumnClient } from "./ReactAutumnClient";

export async function checkoutMethod(
	this: AutumnClient,
	params: CheckoutParams,
): Promise<operations.PostCheckoutResponse> {
	const res = await this.post(`${this.prefix}/checkout`, params);
	return res;
}

export async function attachMethod(
	this: AutumnClient,
	params: AttachParams,
): Promise<operations.PostAttachResponse> {
	const res = await this.post(`${this.prefix}/attach`, params);
	return res;
}
export async function setupPaymentMethod(
	this: AutumnClient,
	params: SetupPaymentParams,
): Promise<operations.PostSetupPaymentResponse> {
	const res = await this.post(`${this.prefix}/setup_payment`, params);
	return res;
}

export async function cancelMethod(
	this: AutumnClient,
	params: CancelParams,
): Promise<operations.PostCancelResponse> {
	const res = await this.post(`${this.prefix}/cancel`, params);
	return res;
}

export async function checkMethod(
	this: AutumnClient,
	params: CheckParams,
): Promise<operations.PostCheckResponse> {
	// Remove dialog from params
	const noDialogParams = {
		...params,
		dialog: undefined,
	};

	const res = await this.post(`${this.prefix}/check`, noDialogParams);
	return res;
}

export async function trackMethod(
	this: AutumnClient,
	params: TrackParams,
): Promise<operations.PostTrackResponse> {
	const res = await this.post(`${this.prefix}/track`, params);
	return res;
}

export async function openBillingPortalMethod(
	this: AutumnClient,
	params?: BillingPortalParams,
): Promise<operations.PostCustomersCustomerIdBillingPortalResponse> {
	const res = await this.post(`${this.prefix}/billing_portal`, params || {});
	return res;
}

export async function queryMethod(
	this: AutumnClient,
	params: QueryParams,
): Promise<operations.PostQueryResponse> {
	const res = await this.post(`${this.prefix}/query`, params);
	return res;
}
