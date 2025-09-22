import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachFlags } from "../models/AttachFlags.js";
import {
	AttachConfig,
	AttachBranch,
	intervalsSame,
	intervalToValue,
} from "@autumn/shared";
import { AttachBody } from "@autumn/shared";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { nullish, notNullish } from "@/utils/genUtils.js";
import { ProrationBehavior } from "@autumn/shared";
import { attachParamsToProduct } from "./convertAttachParams.js";
import { attachParamToCusProducts } from "./convertAttachParams.js";
import { cusProductToPrices } from "@autumn/shared";
import { willMergeSub } from "../mergeUtils/mergeUtils.js";

export const intervalsAreSame = ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	let { curMainProduct, curSameProduct } = attachParamToCusProducts({
		attachParams,
	});

	let curCusProduct = curSameProduct || curMainProduct;

	if (!curCusProduct) {
		return false;
	}

	let newProduct = attachParamsToProduct({ attachParams });
	let curPrices = cusProductToPrices({ cusProduct: curCusProduct! });

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

	let flags: AttachFlags = {
		isPublic: req.isPublic,
		forceCheckout: attachBody.force_checkout || false,
		invoiceOnly: attachParams.invoiceOnly || false,
		isFree: isFreeProduct(prices),
		noPaymentMethod: nullish(paymentMethod) ? true : false,
	};

	const { isPublic, forceCheckout, invoiceOnly, isFree, noPaymentMethod } =
		flags;

	let proration =
		branch == AttachBranch.SameCustomEnts || branch == AttachBranch.NewVersion
			? ProrationBehavior.None
			: org.config.bill_upgrade_immediately
				? ProrationBehavior.Immediately
				: ProrationBehavior.NextBilling;

	let carryUsage =
		branch == AttachBranch.SameCustomEnts ||
		branch == AttachBranch.SameCustom ||
		branch == AttachBranch.NewVersion;

	// Disable trial if doing a merge sub or something else...
	// Is merge sub...
	const willMerge = await willMergeSub({ attachParams, branch });

	let disableTrial =
		branch === AttachBranch.NewVersion ||
		branch == AttachBranch.Downgrade ||
		willMerge ||
		attachBody.free_trial === false;

	let freeTrialWithoutCardRequired =
		notNullish(attachParams.freeTrial) &&
		attachParams.freeTrial?.card_required === false;

	let carryTrial = branch === AttachBranch.NewVersion || willMerge;

	let sameIntervals = intervalsAreSame({ attachParams });

	// let disableMerge =
	//   branch == AttachBranch.MainIsTrial ||
	//   org.config.merge_billing_cycles === false;

	const invoiceAndEnable =
		attachParams.invoiceOnly && attachBody.enable_product_immediately;

	const invoiceCheckout =
		attachParams.invoiceOnly === true && !attachBody.enable_product_immediately;

	const checkoutFlow =
		isPublic ||
		forceCheckout ||
		invoiceCheckout ||
		(noPaymentMethod &&
			!invoiceAndEnable &&
			branch != AttachBranch.MultiAttachUpdate);

	const onlyCheckout = !isFree && checkoutFlow && !freeTrialWithoutCardRequired;
	const disableMerge = branch == AttachBranch.MainIsTrial || onlyCheckout;

	// Require payment method...
	let paymentMethodRequired = true;
	if (
		!disableTrial &&
		attachParams.freeTrial &&
		attachParams.freeTrial.card_required === false
	) {
		paymentMethodRequired = false;
	}
	if (attachParams.invoiceOnly) {
		paymentMethodRequired = false;
	}

	let config: AttachConfig = {
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
