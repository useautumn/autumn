import {
	type AttachConfig,
	BillingType,
	ErrCode,
	type FullCusProduct,
} from "@autumn/shared";
import { Router } from "express";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
import {
	createStripeCusIfNotExists,
	getCusPaymentMethod,
} from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
	getBillingType,
	getEntOptions,
	getPriceEntitlement,
	getProductForPrice,
	priceIsOneOffAndTiered,
} from "@/internal/products/prices/priceUtils.js";
import {
	checkStripeProductExists,
	isFreeProduct,
} from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
	notNullish,
	notNullOrUndefined,
	nullOrUndefined,
} from "@/utils/genUtils.js";
import { handleCheckout } from "./checkout/handleCheckout.js";
import { handleAttach } from "./handleAttach.js";
import { handleAttachPreview } from "./handleAttachPreview/handleAttachPreview.js";

export const attachRouter: Router = Router();

export const handlePrepaidErrors = async ({
	attachParams,
	config,
	useCheckout = false,
}: {
	attachParams: AttachParams;
	config: AttachConfig;
	useCheckout?: boolean;
}) => {
	const { prices, entitlements, optionsList } = attachParams;

	// 2. Check if options are valid
	for (const price of prices) {
		const billingType = getBillingType(price.config!);

		if (billingType === BillingType.UsageInAdvance) {
			// Get options for price
			const priceEnt = getPriceEntitlement(price, entitlements);
			const options = getEntOptions(optionsList, priceEnt);

			// 1. If not checkout, quantity should be defined
			const regularCheckout = useCheckout && !config.invoiceCheckout;
			if (!regularCheckout && nullOrUndefined(options?.quantity)) {
				throw new RecaseError({
					message: `Pass in 'quantity' for feature ${priceEnt.feature_id} in options`,
					code: ErrCode.InvalidOptions,
					statusCode: 400,
				});
			}

			if (
				nullOrUndefined(options?.quantity) &&
				priceIsOneOffAndTiered(price, priceEnt)
			) {
				throw new RecaseError({
					code: ErrCode.InvalidRequest,
					message:
						"Quantity is required for start of period price that is one off and tiered",
					statusCode: 400,
				});
			}

			// 3. Quantity cannot be negative
			if (notNullish(options?.quantity) && options?.quantity! < 0) {
				throw new RecaseError({
					message: `Quantity cannot be negative`,
					code: ErrCode.InvalidOptions,
					statusCode: 400,
				});
			}

			// 4. If there's only one price, quantity must be greater than 0
			if (options?.quantity === 0 && prices.length === 1) {
				throw new RecaseError({
					message: `When there's only one price, quantity must be greater than 0`,
					code: ErrCode.InvalidOptions,
					statusCode: 400,
				});
			}
		}
	}
};

export const handlePublicAttachErrors = async ({
	curCusProduct,
	isPublic,
}: {
	curCusProduct: FullCusProduct | null;
	isPublic: boolean;
}) => {
	if (!isPublic) {
		return;
	}

	if (!curCusProduct) {
		return;
	}

	// 1. If on paid plan, not allowed to switch product
	const curProductFree = isFreeProduct(
		curCusProduct?.customer_prices.map((cp: any) => cp.price) || [], // if no current product...
	);

	if (!curProductFree) {
		throw new RecaseError({
			message: "Public attach: not allowed to upgrade / downgrade (from paid)",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

export const checkStripeConnections = async ({
	req,
	attachParams,
	createCus = true,
	useCheckout = false,
}: {
	req: any;
	attachParams: AttachParams;
	createCus?: boolean;
	useCheckout?: boolean;
}) => {
	const { org, customer, products, stripeCus, stripeCli } = attachParams;
	const logger = req.logtail;
	const env = customer.env;

	// 2. If invoice only and no email, save email
	if (attachParams.invoiceOnly && !customer.email) {
		customer.email = `${customer.id}-${org.id}@invoices.useautumn.com`;
		await Promise.all([
			CusService.update({
				db: req.db,
				internalCusId: customer.internal_id,
				update: {
					email: customer.email,
				},
			}),
			stripeCus &&
				stripeCli.customers.update(stripeCus.id, {
					email: customer.email,
				}),
		]);
	}

	const batchProductUpdates = [];

	if (createCus) {
		batchProductUpdates.push(
			createStripeCusIfNotExists({
				db: req.db,
				org,
				env,
				customer,
				logger,
			}),
		);
	}

	for (const product of products) {
		batchProductUpdates.push(
			checkStripeProductExists({
				db: req.db,
				org,
				env,
				product,
				logger,
			}),
		);
	}
	await Promise.all(batchProductUpdates);

	await createStripePrices({
		attachParams,
		useCheckout,
		req,
		logger,
	});
};

export const createStripePrices = async ({
	attachParams,
	useCheckout,
	req,
	logger,
}: {
	attachParams: AttachParams;
	useCheckout: boolean;
	req: any;
	logger: any;
}) => {
	const { prices, entitlements, products, org, stripeCli } = attachParams;

	const batchPriceUpdates = [];

	// const curCusProduct = attachParamsToCurCusProduct({ attachParams });

	for (const price of prices) {
		const product = getProductForPrice(price, products);

		batchPriceUpdates.push(
			createStripePriceIFNotExist({
				db: req.db,
				stripeCli,
				price,
				entitlements,
				product: product!,
				org,
				logger,
				internalEntityId: attachParams.internalEntityId,
				useCheckout,
			}),
		);
	}
	await Promise.all(batchPriceUpdates);
};

export const customerHasPm = async ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	// SCENARIO 3: No payment method, checkout required
	const paymentMethod = await getCusPaymentMethod({
		stripeCli: createStripeCli({
			org: attachParams.org,
			env: attachParams.customer.env,
		}),
		stripeId: attachParams.customer.processor?.id,
	});

	return notNullOrUndefined(paymentMethod) ? true : false;
};

attachRouter.post("/attach", handleAttach);
attachRouter.post("/attach/preview", handleAttachPreview);
attachRouter.post("/checkout", handleCheckout);
