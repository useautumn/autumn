import type * as operations from "@useautumn/sdk/models/operations";
import type { AutumnContextParams } from "../../AutumnContext";
import type {
	AttachParams,
	BillingPortalParams,
	CancelParams,
	CheckoutParams,
	SetupPaymentParams,
	TrackParams,
} from "../../client/autumnTypes";
import type { ConvexAutumnClient } from "../../client/ConvexAutumnClient";
import type { AutumnClient } from "../../client/ReactAutumnClient";
import { usePricingTableBase } from "../usePricingTableBase";

export const useAutumnBase = ({
	// AutumnContext,
	context,
	client,
	refetchCustomer,
}: {
	// AutumnContext: React.Context<AutumnContextParams>;
	context?: AutumnContextParams;
	client: AutumnClient | ConvexAutumnClient;
	refetchCustomer?: () => Promise<any>;
}) => {
	const { attachDialog, paywallDialog } = context || {};

	const { refetch: refetchPricingTable } = usePricingTableBase({ client });

	const attachWithoutDialog = async (
		params: AttachParams,
	): Promise<operations.PostAttachResponse> => {
		const result = await client.attach(params);

		if (result.checkoutUrl && typeof window !== "undefined") {
			if (params.openInNewTab) {
				window.open(result.checkoutUrl, "_blank");
			} else {
				window.location.href = result.checkoutUrl;
			}
		}

		await refetchPricingTable();
		if (refetchCustomer) {
			await refetchCustomer();
		}

		attachDialog?.setOpen(false);

		return result;
	};

	const checkout = async (
		params: CheckoutParams,
	): Promise<operations.PostCheckoutResponse> => {
		const data = await client.checkout(params);
		const { dialog, ...rest } = params;

		if (params.dialog && params.productIds) {
			throw new Error(
				"Dialog and productIds are not supported together in checkout()",
			);
		}

		const hasPrepaid = data.product?.items?.some(
			(item: any) => item.usageModel === "prepaid",
		);

		const showDialog = hasPrepaid && params.dialog;

		if (data.url && !showDialog) {
			if (params.openInNewTab) {
				window.open(data.url, "_blank");
			} else {
				window.location.href = data.url;
			}

			return data;
		}

		if (params.dialog) {
			attachDialog?.setProps({ checkoutResult: data, checkoutParams: rest });
			attachDialog?.setComponent(params.dialog);
			attachDialog?.setOpen(true);
		}

		return data;
	};

	const attachWithDialog = async (
		params: AttachParams,
	): Promise<operations.PostAttachResponse | operations.PostCheckResponse> => {
		const { ...rest } = params;

		const { entityId, entityData } = params;

		const checkRes = await client.check({
			entityData,
			withPreview: true,
			entityId: entityId ?? undefined,
		});

		const preview = checkRes.preview;

		if (!preview) {
			return await attachWithoutDialog(rest);
		} else {
			attachDialog?.setProps({ preview, attachParams: rest });
			attachDialog?.setOpen(true);
		}

		return checkRes;
	};

	const attach = async (
		params: AttachParams,
	): Promise<operations.PostAttachResponse> => {
		const { dialog } = params;

		if (dialog && !attachDialog?.open) {
			attachDialog?.setComponent(dialog);
			return (await attachWithDialog(params)) as operations.PostAttachResponse;
		}

		return await attachWithoutDialog(params);
	};

	const cancel = async (
		params: CancelParams,
	): Promise<operations.PostCancelResponse> => {
		const res = await client.cancel(params);
		return res;
	};

	const track = async (
		params: TrackParams,
	): Promise<operations.PostTrackResponse> => {
		const res = await client.track(params);
		return res;
	};

	const openBillingPortal = async (
		params?: BillingPortalParams,
	): Promise<operations.PostCustomersCustomerIdBillingPortalResponse> => {
		const defaultParams = {
			openInNewTab: false,
		};

		const finalParams = {
			...defaultParams,
			...params,
		};

		const res = await client.openBillingPortal(finalParams);

		if (res.url && typeof window !== "undefined") {
			if (finalParams.openInNewTab) {
				window.open(res.url, "_blank");
			} else {
				window.open(res.url, "_self");
			}
		}

		return res;
	};

	const setupPayment = async (
		params?: SetupPaymentParams,
	): Promise<operations.PostSetupPaymentResponse> => {
		const defaultParams = {
			openInNewTab: false,
		};

		const finalParams = {
			...defaultParams,
			...(params || {}),
		};

		const res = await client.setupPayment(finalParams);

		if (res.url && typeof window !== "undefined") {
			if (finalParams.openInNewTab) {
				window.open(res.url, "_blank");
			} else {
				window.open(res.url, "_self");
			}
		}

		return res;
	};

	return {
		attach,
		track,
		cancel,
		openBillingPortal,
		setupPayment,
		checkout,
	};
};
