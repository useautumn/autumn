import {
	type FullCustomer,
	type FullProduct,
	LegacyVersion,
} from "@autumn/shared";
import { createStripeCli } from "@/external/stripe/utils.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getFreeTrialAfterFingerprint } from "@/internal/products/free-trials/freeTrialUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { orgToVersion } from "@/utils/versionUtils/legacyVersionUtils.js";
import { getStripeCusData } from "./attachParamsUtils/getStripeCusData.js";

export const checkToAttachParams = async ({
	req,
	customer,
	product,
	logger,
}: {
	req: ExtendedRequest;
	customer: FullCustomer;
	product: FullProduct;
	logger: any;
}) => {
	const { org, env, db } = req;

	const apiVersion =
		orgToVersion({
			org,
			reqApiVersion: req.apiVersion,
		}) || LegacyVersion.v1;

	const stripeCli = createStripeCli({ org, env });
	const stripeCusData = await getStripeCusData({
		stripeCli,
		db,
		org,
		env,
		customer,
		logger,
		allowNoStripe: true,
	});

	const freeTrial = await getFreeTrialAfterFingerprint({
		db,
		freeTrial: product.free_trial,
		fingerprint: customer.fingerprint,
		internalCustomerId: customer.internal_id,
		multipleAllowed: org.config.multiple_trials,
		productId: product.id,
	});

	const { stripeCus, paymentMethod, now } = stripeCusData;

	const attachParams: AttachParams = {
		stripeCli,
		stripeCus,
		now,
		paymentMethod,

		customer,
		products: [product],
		optionsList: [],
		prices: product.prices,
		entitlements: product.entitlements,
		freeTrial,
		replaceables: [],

		// Others
		req,
		org: req.org,
		entities: customer.entities,
		features: req.features,
		internalEntityId: customer.entity?.internal_id,
		cusProducts: customer.customer_products,

		// Others
		apiVersion,
	};

	return attachParams;
};
