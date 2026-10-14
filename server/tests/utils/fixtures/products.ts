import {
	BillingInterval,
	type CustomerBillingControls,
	type CustomerBillingControlsParams,
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

const base = ({
	items,
	id = "base",
	isDefault = false,
	isAddOn = false,
	group,
	trialDays,
	freeTrial,
	billingControls,
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
	billingControls?: CustomerBillingControlsParams;
}): ProductV2 => ({
	...constructRawProduct({ id, items, isAddOn, group }),
	is_default: isDefault,
	...(billingControls
		? { billing_controls: billingControls as CustomerBillingControls }
		: {}),
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

const pro = ({
	items,
	id = "pro",
	group,
	billingControls,
}: {
	items: ProductItem[];
	id?: string;
	group?: string;
	billingControls?: CustomerBillingControlsParams;
}): ProductV2 => ({
	...constructProduct({
		id,
		items: [...items],
		type: "pro",
		isDefault: false,
		group,
	}),
	...(billingControls
		? { billing_controls: billingControls as CustomerBillingControls }
		: {}),
});

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

const proWithTrial = ({
	items,
	id = "pro-trial",
	trialDays = 7,
	cardRequired = true,
	uniqueFingerprint = false,
}: {
	items: ProductItem[];
	id?: string;
	trialDays?: number;
	cardRequired?: boolean;
	uniqueFingerprint?: boolean;
}): ProductV2 =>
	constructProduct({
		id,
		items: [...items],
		type: "pro",
		isDefault: false,
		freeTrial: {
			length: trialDays,
			duration: FreeTrialDuration.Day,
			unique_fingerprint: uniqueFingerprint,
			card_required: cardRequired,
		},
	});

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

const recurringAddOn = ({
	items,
	id = "addon",
	billingControls,
}: {
	items: ProductItem[];
	id?: string;
	billingControls?: CustomerBillingControlsParams;
}): ProductV2 => ({
	...constructProduct({
		id,
		items: [...items],
		type: "pro",
		isDefault: false,
		isAddOn: true,
	}),
	...(billingControls
		? { billing_controls: billingControls as CustomerBillingControls }
		: {}),
});

const oneOffAddOn = ({
	items,
	id = "one-off-addon",
	billingControls,
}: {
	items: ProductItem[];
	id?: string;
	billingControls?: CustomerBillingControlsParams;
}): ProductV2 => ({
	...constructProduct({
		id,
		items: [...items],
		type: "one_off",
		isDefault: false,
		isAddOn: true,
	}),
	...(billingControls
		? { billing_controls: billingControls as CustomerBillingControls }
		: {}),
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
	oneOffAddOn,
} as const;
