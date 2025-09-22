import {
	getStripeSchedules,
	getStripeSubs,
} from "@/external/stripe/stripeSubUtils.js";
import {
	AppEnv,
	AttachScenario,
	FullCusProduct,
	intervalsSame,
	Organization,
	Product,
} from "@autumn/shared";
import Stripe from "stripe";
import { fullCusProductToProduct } from "../cusProducts/cusProductUtils.js";
import {
	ACTIVE_STATUSES,
	CusProductService,
} from "../cusProducts/CusProductService.js";

import { getExistingCusProducts } from "../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";

import { getFilteredScheduleItems } from "./scheduleUtils/getFilteredScheduleItems.js";
import { updateScheduledSubWithNewItems } from "./scheduleUtils/updateScheduleWithNewItems.js";
import {
	addCurMainProductToSchedule,
	getOtherCusProductsOnSub,
} from "./scheduleUtils/cancelScheduledFreeProduct.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { notNullish } from "@/utils/genUtils.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";

export const getPricesForCusProduct = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	if (!cusProduct) {
		return [];
	}
	return cusProduct.customer_prices.map((price) => price.price);
};

export const getScheduleIdsFromCusProducts = ({
	cusProducts,
}: {
	cusProducts: (FullCusProduct | null | undefined)[];
}) => {
	let scheduleIds: string[] = [];
	for (const cusProduct of cusProducts) {
		if (cusProduct) {
			scheduleIds = scheduleIds.concat(cusProduct.scheduled_ids || []);
		}
	}
	return scheduleIds;
};
