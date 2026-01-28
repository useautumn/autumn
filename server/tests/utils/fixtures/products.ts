import {
	BillingInterval,
	type FreeTrial,
	FreeTrialDuration,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";

/**
 * Base product - no base price, customizable defaults
 * @param items - Product items (features)
 * @param id - Product ID (default: "base")
 * @param isDefault - Whether this is a default product (default: false)
 * @param group - Optional product group (if set, won't be overridden by test prefix)
 * @param trialDays - Optional number of trial days (shorthand)
 * @param freeTrial - Optional full free trial config (overrides trialDays)
 */
const base = ({
	items,
	id = "base",
	isDefault = false,
	isAddOn = false,
	group,
	trialDays,
	freeTrial,
}: {
	items: ProductItem[];
	id?: string;
	isDefault?: boolean;
	isAddOn?: boolean;
	group?: string;
	trialDays?: number;
	freeTrial?: {
		length: number;
		duration: FreeTrialDuration;
		cardRequired?: boolean;
		uniqueFingerprint?: boolean;
	};
}): ProductV2 => ({
	...constructRawProduct({ id, items, isAddOn, group }),
	is_default: isDefault,
	...(freeTrial
		? {
				free_trial: {
					length: freeTrial.length,
					duration: freeTrial.duration,
					unique_fingerprint: freeTrial.uniqueFingerprint ?? false,
					card_required: freeTrial.cardRequired ?? true,
				} as unknown as FreeTrial,
			}
		: trialDays && {
				free_trial: {
					length: trialDays,
					duration: FreeTrialDuration.Day,
					unique_fingerprint: false,
					card_required: true,
				} as unknown as FreeTrial,
			}),
});

/**
 * Pro product - $20/month base price
 * @param items - Product items (features)
 * @param id - Product ID (default: "pro")
 */
const pro = ({
	items,
	id = "pro",
}: {
	items: ProductItem[];
	id?: string;
}): ProductV2 =>
	constructProduct({
		id,
		items: [...items],
		type: "pro",
		isDefault: false,
	});

/**
 * Pro annual product - $200/year base price
 * @param items - Product items (features)
 * @param id - Product ID (default: "pro-annual")
 */
const proAnnual = ({
	items,
	id = "pro-annual",
}: {
	items: ProductItem[];
	id?: string;
}): ProductV2 =>
	constructProduct({
		id,
		items: [...items],
		type: "pro",
		isAnnual: true,
		isDefault: false,
	});

/**
 * Pro product with free trial - $20/month base price with configurable trial
 * @param items - Product items (features)
 * @param id - Product ID (default: "pro-trial")
 * @param trialDays - Number of trial days (default: 7)
 * @param cardRequired - Whether card is required for trial (default: true)
 */
const proWithTrial = ({
	items,
	id = "pro-trial",
	trialDays = 7,
	cardRequired = true,
}: {
	items: ProductItem[];
	id?: string;
	trialDays?: number;
	cardRequired?: boolean;
}): ProductV2 =>
	constructProduct({
		id,
		items: [...items],
		type: "pro",
		isDefault: false,
		freeTrial: {
			length: trialDays,
			duration: FreeTrialDuration.Day,
			unique_fingerprint: false,
			card_required: cardRequired,
		},
	});

/**
 * Premium product with free trial - $50/month base price with configurable trial
 * @param items - Product items (features)
 * @param id - Product ID (default: "premium-trial")
 * @param trialDays - Number of trial days (default: 7)
 * @param cardRequired - Whether card is required for trial (default: true)
 */
const premiumWithTrial = ({
	items,
	id = "premium-trial",
	trialDays = 7,
	cardRequired = true,
}: {
	items: ProductItem[];
	id?: string;
	trialDays?: number;
	cardRequired?: boolean;
}): ProductV2 =>
	constructProduct({
		id,
		items: [...items],
		type: "premium",
		isDefault: false,
		freeTrial: {
			length: trialDays,
			duration: FreeTrialDuration.Day,
			unique_fingerprint: false,
			card_required: cardRequired,
		},
	});

/**
 * Base (free) product with free trial - no base price, with configurable trial
 * @param items - Product items (features)
 * @param id - Product ID (default: "base-trial")
 * @param trialDays - Number of trial days (default: 7)
 * @param cardRequired - Whether card is required for trial (default: false)
 */
const baseWithTrial = ({
	items,
	id = "base-trial",
	trialDays = 7,
	cardRequired = false,
}: {
	items: ProductItem[];
	id?: string;
	trialDays?: number;
	cardRequired?: boolean;
}): ProductV2 => ({
	...constructRawProduct({ id, items }),
	is_default: false,
	free_trial: {
		length: trialDays,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: false,
		card_required: cardRequired,
	} as unknown as FreeTrial,
});

/**
 * Default trial product - $20/month product with trial that's set as default
 * @param items - Product items (features)
 * @param id - Product ID (default: "default-trial")
 * @param trialDays - Number of trial days (default: 7)
 * @param cardRequired - Whether card is required for trial (default: false)
 */
const defaultTrial = ({
	items,
	id = "default-trial",
	trialDays = 7,
	cardRequired = false,
}: {
	items: ProductItem[];
	id?: string;
	trialDays?: number;
	cardRequired?: boolean;
}): ProductV2 => ({
	...constructRawProduct({
		id,
		items: [
			...items,
			constructPriceItem({ price: 20, interval: BillingInterval.Month }),
		],
	}),
	is_default: true,
	free_trial: {
		length: trialDays,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: false,
		card_required: cardRequired,
	} as unknown as FreeTrial,
});

/**
 * Premium product - $50/month base price
 * @param items - Product items (features)
 * @param id - Product ID (default: "premium")
 */
const premium = ({
	items,
	id = "premium",
}: {
	items: ProductItem[];
	id?: string;
}): ProductV2 =>
	constructProduct({
		id,
		items: [...items],
		type: "premium",
		isDefault: false,
	});

/**
 * Growth product - $100/month base price
 * @param items - Product items (features)
 * @param id - Product ID (default: "growth")
 */
const growth = ({
	items,
	id = "growth",
}: {
	items: ProductItem[];
	id?: string;
}): ProductV2 =>
	constructProduct({
		id,
		items: [...items],
		type: "growth",
		isDefault: false,
	});

/**
 * Ultra product - $200/month base price (uses base with custom price)
 * @param items - Product items (features)
 * @param id - Product ID (default: "ultra")
 */
const ultra = ({
	items,
	id = "ultra",
}: {
	items: ProductItem[];
	id?: string;
}): ProductV2 => ({
	...constructRawProduct({
		id,
		items: [
			...items,
			constructPriceItem({ price: 200, interval: BillingInterval.Month }),
		],
	}),
	is_default: false,
});

/**
 * One-off product - one-time purchase with $10 base price
 * @param items - Product items (features)
 * @param id - Product ID (default: "one-off")
 * @param isAddOn - Whether this is an add-on product (default: false)
 */
const oneOff = ({
	items,
	id = "one-off",
	isAddOn = false,
}: {
	items: ProductItem[];
	id?: string;
	isAddOn?: boolean;
}): ProductV2 =>
	constructProduct({
		id,
		items: [...items],
		type: "one_off",
		isDefault: false,
		isAddOn,
	});

/**
 * Recurring add-on product - $20/month base price, is_add_on: true
 * @param items - Product items (features)
 * @param id - Product ID (default: "addon")
 */
const recurringAddOn = ({
	items,
	id = "addon",
}: {
	items: ProductItem[];
	id?: string;
}): ProductV2 =>
	constructProduct({
		id,
		items: [...items],
		type: "pro",
		isDefault: false,
		isAddOn: true,
	});

export const products = {
	base,
	baseWithTrial,
	defaultTrial,
	pro,
	proAnnual,
	proWithTrial,
	premium,
	premiumWithTrial,
	growth,
	ultra,
	oneOff,
	recurringAddOn,
} as const;
