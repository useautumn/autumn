import type { AttachBody } from "@autumn/shared";
import { nullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { AttachParams } from "../../../cusProducts/AttachParams.js";
import { processAttachBody } from "./processAttachBody.js";

export const getAttachParams = async ({
	req,
	attachBody,
}: {
	req: ExtendedRequest;
	attachBody: AttachBody;
}) => {
	const {
		customer,
		products,
		optionsList,
		prices,
		entitlements,
		freeTrial,
		customPrices,
		customEnts,
		stripeVars,
		rewards,
	} = await processAttachBody({
		req,
		attachBody,
	});

	const entityId = attachBody.entity_id;

	const internalEntityId = entityId ? customer.entity?.internal_id : undefined;
	const { stripeCli, stripeCus, paymentMethod, now } = stripeVars;

	if (nullish(attachBody.finalize_invoice)) {
		attachBody.finalize_invoice = true;
	}

	const attachParams: AttachParams = {
		stripeCli,
		stripeCus,
		now,
		paymentMethod,

		customer,
		products,
		optionsList,
		prices,
		entitlements,
		freeTrial,
		replaceables: [],
		rewards,
		// From req
		req,
		org: req.org,
		entities: customer.entities,
		features: req.features,
		internalEntityId,
		entityId: entityId || undefined,
		cusProducts: customer.customer_products,

		successUrl: attachBody.success_url,
		invoiceOnly: attachBody.invoice,
		productsList: attachBody.products || undefined,
		// || attachBody.invoice_only

		billingAnchor: attachBody.billing_cycle_anchor,
		metadata: attachBody.metadata,
		disableFreeTrial: attachBody.free_trial === false || false,
		checkoutSessionParams: attachBody.checkout_session_params,
		isCustom: attachBody.is_custom,
		setupPayment: attachBody.setup_payment,

		// Others
		apiVersion: req.apiVersion.value,
	};

	return {
		attachParams,
		customPrices,
		customEnts,
	};
};
