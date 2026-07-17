import { BillingInterval, type PlanLicenseParams } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";

export const buildCustomizedLicenseEntry = ({
	licensePlanId,
	price,
	messages,
	included = 0,
	words,
	credits,
}: {
	licensePlanId: string;
	price: number;
	messages: number;
	included?: number;
	words?: number;
	credits?: number;
}): PlanLicenseParams => ({
	license_plan_id: licensePlanId,
	included,
	customize: {
		price: { amount: price, interval: BillingInterval.Month },
		remove_items: [{ feature_id: TestFeature.Messages }],
		add_items: [
			itemsV2.monthlyMessages({ included: messages }),
			...(words === undefined
				? []
				: [itemsV2.monthlyWords({ included: words })]),
			...(credits === undefined
				? []
				: [itemsV2.monthlyCredits({ included: credits })]),
		],
	},
});
