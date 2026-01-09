import {
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
 */
const base = ({
	items,
	id = "base",
	isDefault = false,
}: {
	items: ProductItem[];
	id?: string;
	isDefault?: boolean;
}): ProductV2 => ({
	...constructRawProduct({ id, items }),
	is_default: isDefault,
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

export const products = {
	base,
	pro,
	proAnnual,
	proWithTrial,
} as const;
