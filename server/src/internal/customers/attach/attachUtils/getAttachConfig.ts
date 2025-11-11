import {
	type AttachBody,
	AttachBranch,
	type AttachConfig,
	cusProductToPrices,
	cusProductToProduct,
	intervalToValue,
	ProrationBehavior,
} from "@autumn/shared";
import { isDefaultTrialFullProduct } from "@/internal/products/productUtils/classifyProduct.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import type { AttachParams } from "../../cusProducts/AttachParams.js";
import { willMergeSub } from "../mergeUtils/mergeUtils.js";
import type { AttachFlags } from "../models/AttachFlags.js";
import {
	attachParamsToProduct,
	attachParamToCusProducts,
} from "./convertAttachParams.js";

export const intervalsAreSame = ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	const { curMainProduct, curSameProduct } = attachParamToCusProducts({
		attachParams,
	});

	const curCusProduct = curSameProduct || curMainProduct;

	if (!curCusProduct) {
		return false;
	}

	const newProduct = attachParamsToProduct({ attachParams });
	const curPrices = cusProductToPrices({ cusProduct: curCusProduct! });

	const curIntervals = new Set(
		curPrices.map((p) =>
			intervalToValue(p.config.interval, p.config.interval_count),
		),
	);

	const newIntervals = new Set(
		newProduct.prices.map((p) =>
			intervalToValue(p.config.interval, p.config.interval_count),
		),
	);

	return (
		curIntervals.size === newIntervals.size &&
		[...curIntervals].every((interval) => newIntervals.has(interval))
	);
};

export const getAttachConfig = async ({
	req,
	attachParams,
	attachBody,
	branch,
}: {
	req: any;
	attachParams: AttachParams;
	attachBody: AttachBody;
	branch: AttachBranch;
}) => {
	const { org, prices, paymentMethod } = attachParams;

	const flags: AttachFlags = {
		isPublic: req.isPublic,
		forceCheckout: attachBody.force_checkout || false,
		invoiceOnly: attachParams.invoiceOnly || false,
		isFree: isFreeProduct(prices),
		noPaymentMethod: nullish(paymentMethod),
	};

	const { isPublic, forceCheckout, isFree, noPaymentMethod } = flags;

	const proration =
		branch === AttachBranch.SameCustomEnts || branch === AttachBranch.NewVersion
			? ProrationBehavior.None
			: org.config.bill_upgrade_immediately
				? ProrationBehavior.Immediately
				: ProrationBehavior.NextBilling;

	const carryUsage =
		branch === AttachBranch.SameCustomEnts ||
		branch === AttachBranch.SameCustom ||
		branch === AttachBranch.NewVersion;

	// Disable trial if doing a merge sub or something else...
	// Is merge sub...
	const willMerge = await willMergeSub({ attachParams, branch });

	const disableTrial =
		branch === AttachBranch.NewVersion ||
		branch === AttachBranch.Downgrade ||
		willMerge ||
		attachBody.free_trial === false;

	const freeTrialWithoutCardRequired =
		notNullish(attachParams.freeTrial) &&
		attachParams.freeTrial?.card_required === false;

	const carryTrial = branch === AttachBranch.NewVersion || willMerge;

	const sameIntervals = intervalsAreSame({ attachParams });

	const invoiceAndEnable =
		attachParams.invoiceOnly && attachBody.enable_product_immediately;

	const invoiceCheckout =
		attachParams.invoiceOnly === true && !attachBody.enable_product_immediately;

	// Check if upgrading from a default trial
	const { curMainProduct } = attachParamToCusProducts({ attachParams });
	let isUpgradingFromDefaultTrial = false;
	if (curMainProduct && branch === AttachBranch.Upgrade) {
		const product = cusProductToProduct({ cusProduct: curMainProduct });
		isUpgradingFromDefaultTrial =
			isDefaultTrialFullProduct({
				product,
				skipDefault: true,
			}) || false;
	}

	const checkoutFlow =
		isPublic ||
		forceCheckout ||
		invoiceCheckout ||
		(noPaymentMethod &&
			!invoiceAndEnable &&
			![
				AttachBranch.MultiAttachUpdate,
				AttachBranch.NewVersion,
				AttachBranch.SameCustomEnts,
			].includes(branch));

	const onlyCheckout = !isFree && checkoutFlow && !freeTrialWithoutCardRequired;

	const disableMerge = branch === AttachBranch.MainIsTrial || onlyCheckout;

	// Require payment method...
	let paymentMethodRequired = true;
	if (
		!disableTrial &&
		attachParams.freeTrial &&
		attachParams.freeTrial.card_required === false
	) {
		paymentMethodRequired = false;
	}

	if (
		flags.invoiceOnly ||
		branch === AttachBranch.NewVersion ||
		branch === AttachBranch.SameCustomEnts
	)
		paymentMethodRequired = false;

	const config: AttachConfig = {
		branch,
		onlyCheckout,
		carryUsage,
		proration,
		disableTrial,
		invoiceOnly: flags.invoiceOnly,
		invoiceCheckout,
		disableMerge,
		sameIntervals,
		carryTrial,
		finalizeInvoice: notNullish(attachBody.finalize_invoice)
			? attachBody.finalize_invoice!
			: true,
		requirePaymentMethod: paymentMethodRequired,
	};

	return { flags, config };
};

export const getDefaultAttachConfig = () => {
	const config: AttachConfig = {
		branch: AttachBranch.New,
		carryUsage: false,
		onlyCheckout: false,
		proration: ProrationBehavior.None,
		disableTrial: false,
		invoiceOnly: false,
		disableMerge: false,
		sameIntervals: false,
		carryTrial: false,
		invoiceCheckout: false,
		finalizeInvoice: true,
		requirePaymentMethod: true,
	};

	return config;
};
