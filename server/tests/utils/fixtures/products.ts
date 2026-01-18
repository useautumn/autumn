import {
	type FreeTrial,
	FreeTrialDuration,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";

/**
 * Base product - no base price, customizable defaults
 * @param items - Product items (features)
 * @param id - Product ID (default: "base")
 * @param isDefault - Whether this is a default product (default: false)
 * @param trialDays - Optional number of trial days
 */
const base = ({
	items,
	id = "base",
	isDefault = false,
	isAddOn = false,
	trialDays,
}: {
	items: ProductItem[];
	id?: string;
	isDefault?: boolean;
	isAddOn?: boolean;
	trialDays?: number;
}): ProductV2 => ({
	...constructRawProduct({ id, items, isAddOn }),
	is_default: isDefault,
	...(trialDays && {
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
 * One-off product - one-time purchase with $10 base price
 * @param items - Product items (features)
 * @param id - Product ID (default: "one-off")
 */
const oneOff = ({
	items,
	id = "one-off",
}: {
	items: ProductItem[];
	id?: string;
}): ProductV2 =>
	constructProduct({
		id,
		items: [...items],
		type: "one_off",
		isDefault: false,
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
	pro,
	proAnnual,
	proWithTrial,
	oneOff,
	recurringAddOn,
} as const;
