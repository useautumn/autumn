import {
	type AttachBodyV0,
	AttachBranch,
	type AttachConfig,
	BillingType,
	cusProductToProcessorType,
	ErrCode,
	ProcessorType,
	RecaseError,
	type UsagePriceConfig,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import {
	getBillingType,
	getEntOptions,
	getPriceEntitlement,
	priceIsOneOffAndTiered,
} from "@/internal/products/prices/priceUtils.js";
import { notNullish, nullOrUndefined } from "@/utils/genUtils.js";
import type { AttachParams } from "../../cusProducts/AttachParams.js";
import type { AttachFlags } from "../models/AttachFlags.js";
import { handleMultiAttachErrors } from "./handleAttachErrors/handleMultiAttachErrors.js";

const handleNonCheckoutErrors = ({
	flags,
	action,
	config,
}: {
	flags: AttachFlags;
	config: AttachConfig;
	action: string;
}) => {
	const { isPublic, forceCheckout, noPaymentMethod } = flags;

	if (isPublic) {
		throw new RecaseError({
			message: `Not allowed to ${action} when using publishable key`,
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	} else if (forceCheckout) {
		throw new RecaseError({
			message: `Not allowed to ${action} when using force_checkout`,
			code: ErrCode.InvalidRequest,
		});
	}
	// } else if (config.invoiceCheckout) {
	// 	throw new RecaseError({
	// 		message: `Not allowed to ${action} when using 'invoice': true`,
	// 		code: ErrCode.InvalidRequest,
	// 		statusCode: StatusCodes.BAD_REQUEST,
	// 	});
	// }
};

const handlePrepaidErrors = async ({
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
		const billingType = getBillingType(price.config);

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
			if (notNullish(options?.quantity) && options.quantity < 0) {
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

			const priceConfig = price.config as UsagePriceConfig;
			const usageLimit = priceEnt.usage_limit;
			const totalQuantity =
				(options?.quantity || 0) * (priceConfig.billing_units || 1);

			if (
				usageLimit &&
				totalQuantity + (priceEnt.allowance || 0) > usageLimit
			) {
				throw new RecaseError({
					message: `Quantity + included usage exceeds usage limit of ${usageLimit} for feature ${priceEnt.feature_id}`,
				});
			}
		}
	}
};

export const handleCustomPaymentMethodErrors = ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	const { paymentMethod } = attachParams;
	if (
		paymentMethod?.type === "custom" &&
		attachParams.customer.processors?.vercel?.custom_payment_method_id ===
			paymentMethod?.custom?.type
	) {
		throw new RecaseError({
			message:
				"This customer is billed outside of Stripe, please use the origin platform to manage their billing.",
		});
	} else if (attachParams.customer.processors?.vercel?.installation_id) {
		throw new RecaseError({
			message:
				"This customer is billed outside of Stripe, please use the origin platform to manage their billing.",
		});
	}
};

export const handleExternalPSPErrors = ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	if (
		attachParams.customer.customer_products.some(
			(cp) => cusProductToProcessorType(cp) !== ProcessorType.Stripe,
		)
	) {
		throw new RecaseError({
			message:
				"This customer is billed outside of Stripe, please use the origin platform to manage their billing.",
		});
	}
};

export const handleAttachErrors = async ({
	attachParams,
	attachBody,
	branch,
	flags,
	config,
}: {
	attachParams: AttachParams;
	attachBody: AttachBodyV0;
	branch: AttachBranch;
	flags: AttachFlags;
	config: AttachConfig;
}) => {
	const { onlyCheckout } = config;

	handleCustomPaymentMethodErrors({
		attachParams,
	});

	handleExternalPSPErrors({
		attachParams,
	});

	if (branch === AttachBranch.MultiAttach) {
		await handleMultiAttachErrors({
			attachParams,
			attachBody,
			branch,
		});
		return;
	}

	// Invoice no payment enabled: onlyCheckout
	// Note: Upgrade from trial should proceed to checkout, so only block if NOT from trial

	if (onlyCheckout || flags.isPublic) {
		const upgradeDowngradeFlows = [
			AttachBranch.Upgrade,
			AttachBranch.Downgrade,
		];

		if (upgradeDowngradeFlows.includes(branch)) {
			handleNonCheckoutErrors({
				flags,
				config,
				action: "perform upgrade or downgrade",
			});
		}
		const updateProductFlows = [
			AttachBranch.NewVersion,
			AttachBranch.SameCustom,
			AttachBranch.UpdatePrepaidQuantity,
		];
		if (updateProductFlows.includes(branch)) {
			handleNonCheckoutErrors({
				flags,
				action: "update current product",
				config,
			});
		}
	}

	// 2. If same custom ents, not allowed if is public flow...
	if (branch === AttachBranch.SameCustomEnts) {
		if (flags.isPublic) {
			throw new RecaseError({
				message:
					"Not allowed to update current product when using publishable key",
			});
		}
	}

	await handlePrepaidErrors({
		attachParams,
		config,
		useCheckout: onlyCheckout,
	});

	// await handleUpdateQuantityErrors({
	//   attachParams,
	// });
};
