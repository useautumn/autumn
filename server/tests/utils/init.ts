import {
	AggregateType,
	AllowanceType,
	type AppEnv,
	BillingInterval,
	BillWhen,
	CouponDurationType,
	type CreateFreeTrial,
	EntInterval,
	type Entitlement,
	type Feature,
	FeatureType,
	FeatureUsageType,
	FreeTrialDuration,
	type Organization,
	PriceType,
	type ProductItem,
	RewardReceivedBy,
	RewardTriggerEvent,
	RewardType,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { attachPmToCus } from "@/external/stripe/stripeCusUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { getAxiosInstance } from "./setup.js";

export const keyToTitle = (key: string) => {
	return key
		.replace(/[_-]/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
};

export const initFeature = ({
	id,
	type,
	creditSchema = [],
	aggregateType = AggregateType.Sum,
	eventName,
	usageType = FeatureUsageType.Single,
}: {
	id: string;
	type: FeatureType;
	creditSchema?: {
		metered_feature_id: string;
		feature_amount: number;
		credit_amount: number;
	}[];
	aggregateType?: AggregateType;
	eventName?: string;
	usageType?: FeatureUsageType;
}): (Feature & { eventName: string }) | any => {
	const name = keyToTitle(id);

	if (type === FeatureType.Boolean) {
		return {
			id,
			name,
			type,
		} as Feature;
	}

	if (type === FeatureType.Metered) {
		return {
			id,
			name,
			type,
			event_names: eventName ? [eventName] : [id],
			config: {
				aggregate: {
					type: aggregateType,
					property: "value",
				},
				usage_type: usageType,
				// group_by: groupBy
				//   ? {
				//       property: groupBy,
				//     }
				//   : undefined,
			},
		} as Feature;
	}

	if (type === FeatureType.CreditSystem) {
		return {
			id,
			name,
			type,
			config: {
				schema: creditSchema,
				usage_type: FeatureUsageType.Single,
			},
		} as Feature;
	}

	throw new Error(`Invalid feature type: ${type}`);
};

export const initEntitlement = ({
	feature,
	allowance,
	interval = EntInterval.Month,
	allowanceType = AllowanceType.Fixed,
	entityFeatureId,
	carryFromPrevious = false,
}: {
	feature: Feature;
	allowance?: number;
	interval?: EntInterval;
	allowanceType?: AllowanceType;
	entityFeatureId?: string;
	carryFromPrevious?: boolean;
}) => {
	if (feature.type === FeatureType.Boolean) {
		return {
			feature_id: feature.id,
			internal_feature_id: feature.internal_id,
		} as Entitlement;
	}

	const isUnlimitedOrNone =
		allowanceType === AllowanceType.Unlimited || allowance == null;

	return {
		feature_id: feature.id,
		internal_feature_id: feature.internal_id,
		allowance_type: allowanceType,
		allowance: isUnlimitedOrNone ? null : allowance,
		interval: isUnlimitedOrNone ? null : interval,
		entity_feature_id: entityFeatureId,
		carry_from_previous: carryFromPrevious,
		created_at: Date.now(),
		id: generateId("ent"),
	} as Entitlement;
};

export const initPrice = ({
	type,
	feature,
	billingInterval = BillingInterval.Month,
	amount = 10.0,
	oneTier = false,
	billingUnits = 10,
}: {
	type:
		| "monthly"
		| "in_advance"
		| "in_arrears"
		| "fixed_cycle"
		| "in_arrear_prorated";
	feature?: Feature;
	billingInterval?: BillingInterval;
	amount?: number;
	oneTier?: boolean;
	billingUnits?: number;
}) => {
	if (type === "monthly" || type === "fixed_cycle") {
		return {
			name: type === "monthly" ? "Monthly" : "Fixed Cycle",
			config: {
				type: PriceType.Fixed,
				amount: amount,
				interval: billingInterval,
			},
		};
	}

	if (!feature) {
		throw new Error("Feature is required for in_advance and in_arrears");
	}

	if (type === "in_advance") {
		return {
			name: "In Advance",
			config: {
				type: PriceType.Usage,
				bill_when: BillWhen.StartOfPeriod,
				feature_id: feature!.id,
				interval: billingInterval,
				billing_units: billingUnits,
				usage_tiers: [
					{
						from: 0,
						to: -1,
						amount: amount || 10.0,
					},
				],
			},
		};
	}

	if (type === "in_arrears" || type === "in_arrear_prorated") {
		return {
			name: "In Arrears",
			config: {
				type: PriceType.Usage,
				bill_when: BillWhen.EndOfPeriod,
				feature_id: feature!.id,
				interval: billingInterval,
				billing_units: billingUnits,
				should_prorate: type === "in_arrear_prorated",
				usage_tiers: oneTier
					? [
							{
								from: 0,
								to: -1,
								amount: amount || 0.01,
							},
						]
					: [
							{
								from: 0,
								to: 10,
								amount: 0.5,
							},
							{
								from: 11,
								to: -1,
								amount: 0.25,
							},
						],
			},
		};
	}
};

export const initFreeTrial = ({
	length,
	uniqueFingerprint = false,
	cardRequired = true,
}: {
	length: number;
	uniqueFingerprint?: boolean;
	cardRequired?: boolean;
}): CreateFreeTrial => {
	return {
		length,
		unique_fingerprint: uniqueFingerprint,
		duration: FreeTrialDuration.Day,
		card_required: cardRequired,
	};
};

export const initProduct = ({
	id,
	isDefault = false,
	isAddOn = false,
	items,
	entitlements,
	prices,
	freeTrial,
	group = "",
}: {
	id: string;
	isDefault?: boolean;
	isAddOn?: boolean;
	items?: Record<string, ProductItem>;
	entitlements: Record<string, Entitlement>;
	prices: any[];
	freeTrial: CreateFreeTrial | null;
	group?: string;
}) => {
	// if (notNullish(items)) {
	//   return {
	//     id,
	//     name: keyToTitle(id),
	//     is_default: isDefault,
	//     is_add_on: isAddOn,
	//     group: group,
	//     items: items,
	//     free_trial: freeTrial,
	//   };
	// }

	return {
		id,
		name: keyToTitle(id),
		is_default: isDefault,
		is_add_on: isAddOn,
		entitlements: entitlements,
		prices,
		free_trial: freeTrial,
		group: group,
	};
};

export const initCustomer = async ({
	customer_data,
	customerId,
	attachPm = false,
	db,
	org,
	env,
	testClockId,
}: {
	customer_data?: {
		id: string;
		name?: string;
		email?: string;
		fingerprint?: string;
	};
	customerId?: string;
	attachPm?: boolean;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	testClockId?: string;
}) => {
	const axiosInstance = getAxiosInstance();

	if (!customerId && !customer_data) {
		throw new Error("customerId or customer_data is required");
	}

	const customerData = customerId
		? {
				id: customerId,
				name: customerId,
				email: `${customerId}@example.com`,
			}
		: customer_data;

	// Delete customer if exists
	try {
		await axiosInstance.delete(`/v1/customers/${customerData!.id}`);
		// console.log("   - Successfully deleted customer");
	} catch (error) {
		// console.log("Failed to delete customer");
	}

	try {
		const { data } = await axiosInstance.post(`/v1/customers`, customerData);
		// Attach stripe card

		if (attachPm) {
			await attachPmToCus({
				customer: data.customer,
				org: org,
				env: env,
				db: db,
				testClockId: testClockId,
			});
		}

		return data.customer;
	} catch (error) {
		console.log("Failed to create customer", error);
	}
};

// Init Reward
export const initReward = ({
	id,
	type = RewardType.PercentageDiscount,
	discountValue,
	durationType = CouponDurationType.OneOff,
	durationValue = 0,
	onlyUsagePrices = false,
	productIds,
	applyToAll = false,
	freeProductId,
	freeProductConfig,
}: {
	id: string;
	type?: RewardType;
	discountValue?: number;
	durationType?: CouponDurationType;
	durationValue?: number;
	onlyUsagePrices?: boolean;
	productIds?: string[];
	applyToAll?: boolean;
	freeProductId?: string;
	freeProductConfig?: {
		durationType: CouponDurationType;
		durationValue: number;
	};
}): any => {
	if (
		type === RewardType.PercentageDiscount ||
		type === RewardType.FixedDiscount ||
		type === RewardType.InvoiceCredits
	) {
		return {
			id,
			name: keyToTitle(id),
			type,

			only_usage_prices: onlyUsagePrices,
			product_ids: productIds,

			discount_config: {
				discount_value: discountValue,
				duration_type: durationType,
				duration_value: durationValue,
				apply_to_all: applyToAll,
			},
		};
	} else if (type === RewardType.FreeProduct) {
		return {
			id,
			name: keyToTitle(id),
			type,
			free_product_id: freeProductId,
			free_product_config: {
				duration_type: freeProductConfig?.durationType,
				duration_value: freeProductConfig?.durationValue,
			},
		};
	}
};

export const initRewardProgram = ({
	id,
	when = RewardTriggerEvent.CustomerCreation,
	productIds = [],
	internalRewardId,
	maxRedemptions = 2,
	receivedBy = RewardReceivedBy.Referrer,
}: {
	id: string;
	productIds?: string[];
	internalRewardId: string;
	when?: RewardTriggerEvent;
	maxRedemptions?: number;
	receivedBy?: RewardReceivedBy;
}): any => {
	return {
		id,
		when,
		product_ids: productIds,
		internal_reward_id: internalRewardId,
		max_redemptions: maxRedemptions,
		received_by: receivedBy,
	};
};
