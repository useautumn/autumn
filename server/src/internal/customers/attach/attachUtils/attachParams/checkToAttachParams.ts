import type { FullCustomer, FullProduct } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getFreeTrialAfterFingerprint } from "@/internal/products/free-trials/freeTrialUtils.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import { getStripeCusData } from "./attachParamsUtils/getStripeCusData.js";

export const checkToAttachParams = async ({
	ctx,
	customer,
	product,
}: {
	ctx: AutumnContext;
	customer: FullCustomer;
	product: FullProduct;
}) => {
	const { org, env, db, logger } = ctx;

	// const apiVersion =
	// 	orgToVersion({
	// 		org,
	// 		reqApiVersion: req.apiVersion,
	// 	}) || LegacyVersion.v1;
	// const apiVersion = req.apiVersion.value;

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
		internalEntityId: customer.entity?.internal_id,
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
		req: ctx,
		org: ctx.org,
		entities: customer.entities,
		features: ctx.features,
		internalEntityId: customer.entity?.internal_id,
		cusProducts: customer.customer_products,

		// Others
		// apiVersion,
	};

	return attachParams;
};
