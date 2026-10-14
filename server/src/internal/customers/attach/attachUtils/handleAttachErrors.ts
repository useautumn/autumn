import {
	type AttachBodyV0,
	AttachBranch,
	type AttachConfig,
	type BillingContext,
	BillingType,
	ErrCode,
	RecaseError,
	TierBehavior,
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
import { handleExternalPSPErrors } from "./handleAttachErrors/handleExternalPSPErrors.js";
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
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
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

	for (const price of prices) {
		const billingType = getBillingType(price.config);

		if (billingType === BillingType.UsageInAdvance) {
			const priceEnt = getPriceEntitlement(price, entitlements);

			const options = getEntOptions(optionsList, priceEnt);

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
					code: ErrCode.InvalidOptions,
					message:
						"Quantity is required for start-of-period prices that are both one-off and tiered",
					statusCode: 400,
				});
			}

			if (notNullish(options?.quantity) && options.quantity < 0) {
				throw new RecaseError({
					message: `Quantity cannot be negative`,
					code: ErrCode.InvalidOptions,
					statusCode: 400,
				});
			}

			if (options?.quantity === 0 && prices.length === 1) {
				throw new RecaseError({
					message: `When attaching a single prepaid price, quantity must be greater than 0`,
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
					statusCode: 400,
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
	if (attachParams.customer.processors?.vercel?.installation_id) {
		throw new RecaseError({
			message:
				"This customer is billed outside of Stripe, please use the origin platform to manage their billing.",
			statusCode: 400,
		});
	}
};

export const handleCustomPaymentMethodErrorsV2 = ({
	billingContext,
}: {
	billingContext: BillingContext;
}) => {
	if (billingContext.skipCustomPaymentMethodGuard) return;

	if (billingContext.fullCustomer.processors?.vercel?.installation_id) {
		throw new RecaseError({
			message:
				"This customer is billed outside of Stripe, please use the origin platform to manage their billing.",
			statusCode: 400,
		});
	}
};

export const handlePrepaidVolumeErrors = ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	for (const price of attachParams.prices) {
		if (price.tier_behavior === TierBehavior.VolumeBased) {
			throw new RecaseError({
				message:
					"Volume pricing is not supported on attach V1. Use billing.attach on API V2 to attach plans with volume tiers.",
				statusCode: 400,
			});
		}
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

	handlePrepaidVolumeErrors({
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

	if (branch === AttachBranch.SameCustomEnts) {
		if (flags.isPublic) {
			throw new RecaseError({
				message:
					"Not allowed to update current product when using publishable key",
				statusCode: 400,
			});
		}
	}

	await handlePrepaidErrors({
		attachParams,
		config,
		useCheckout: onlyCheckout,
	});
};
