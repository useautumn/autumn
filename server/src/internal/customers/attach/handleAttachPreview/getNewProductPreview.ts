import {
	AttachBranch,
	type AttachConfig,
	BillingInterval,
	type FullProduct,
	isCusProductTrialing,
} from "@autumn/shared";
import { getOptions } from "@/internal/api/check/checkUtils.js";
import { getItemsForNewProduct } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getNextStartOfMonthUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { getAlignedUnix } from "@/internal/products/prices/billingIntervalUtils2.js";
import { getLargestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import type { Logger } from "../../../../external/logtail/logtailUtils.js";
import type { AttachParams } from "../../cusProducts/AttachParams.js";
import {
	attachParamsToProduct,
	getCustomerSub,
} from "../attachUtils/convertAttachParams.js";

// Just for new product...?
const getNextCycleItems = async ({
	newProduct,
	attachParams,
	anchor,
	branch,
	withPrepaid,
	logger,
	config,
	trialEnds,
}: {
	newProduct: FullProduct;
	attachParams: AttachParams;
	anchor?: number;
	branch: AttachBranch;
	withPrepaid?: boolean;
	logger: any;
	config: AttachConfig;
	trialEnds?: number | null;
}) => {
	// 2. If free trial
	let nextCycleAt: number | undefined;

	if (attachParams.freeTrial) {
		if (trialEnds) {
			nextCycleAt = trialEnds;
		} else {
			nextCycleAt =
				freeTrialToStripeTimestamp({
					freeTrial: attachParams.freeTrial,
					now: attachParams.now,
				})! * 1000;
		}
	} else if (branch !== AttachBranch.OneOff && anchor) {
		// Yearly one
		const largestInterval = getLargestInterval({ prices: newProduct.prices });
		if (largestInterval) {
			nextCycleAt = getAlignedUnix({
				anchor,
				intervalConfig: largestInterval,
				now: attachParams.now,
			});
		}
	}

	const items = await getItemsForNewProduct({
		newProduct,
		attachParams,
		logger,
		withPrepaid,
		// anchor,
	});

	return {
		line_items: items,
		due_at: nextCycleAt,
	};
};

export const getNewProductPreview = async ({
	branch,
	attachParams,
	logger,
	config,
	withPrepaid = false,
}: {
	branch: AttachBranch;
	attachParams: AttachParams;
	logger: Logger;
	config: AttachConfig;
	withPrepaid?: boolean;
}) => {
	const { org } = attachParams;
	const newProduct = attachParamsToProduct({ attachParams });

	let { sub: mergeSub, cusProduct: mergeCusProduct } = await getCustomerSub({
		attachParams,
	});

	if (attachParams.newBillingSubscription) {
		mergeSub = undefined;
		mergeCusProduct = undefined;
	}

	let trialEnds: number | undefined;

	if (config.disableTrial) {
		attachParams.freeTrial = null;
	}

	// Scenario where we update a current sub with new product (so no create sub)
	let anchor: number | undefined;
	if (mergeSub && !config.disableMerge) {
		if (mergeCusProduct?.free_trial) {
			if (
				isCusProductTrialing({
					cusProduct: mergeCusProduct,
					now: attachParams.now,
				})
			) {
				trialEnds = mergeCusProduct.trial_ends_at || undefined;
				attachParams.freeTrial = mergeCusProduct.free_trial;
			} else {
				attachParams.freeTrial = null;
			}
		}

		anchor = mergeSub.billing_cycle_anchor * 1000;
	} else if (org.config.anchor_start_of_month) {
		anchor = getNextStartOfMonthUnix({
			interval: BillingInterval.Month,
			intervalCount: 1,
		});
	}

	const items = await getItemsForNewProduct({
		newProduct,
		attachParams,
		freeTrial: attachParams.freeTrial,
		anchor,
		logger,
		withPrepaid,
	});

	const dueNextCycle = await getNextCycleItems({
		newProduct,
		attachParams,
		anchor,
		branch,
		withPrepaid,
		logger,
		config,
		trialEnds,
	});

	const options = getOptions({
		prodItems: mapToProductItems({
			prices: newProduct.prices,
			entitlements: newProduct.entitlements,
			features: attachParams.features,
		}),
		features: attachParams.features,
		anchor,
		now: attachParams.now || Date.now(),
		freeTrial: attachParams.freeTrial,
	});

	const dueTodayAmt = items.reduce((acc, item) => {
		return acc + (item.amount ?? 0);
	}, 0);

	return {
		currency: attachParams.org.default_currency,
		due_today: {
			line_items: items,
			total: dueTodayAmt,
		},
		due_next_cycle: dueNextCycle,
		free_trial: attachParams.freeTrial,
		options,
	};
};
