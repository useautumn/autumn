import {
	BillingInterval,
	type LimitedItem,
	type ProductItemConfig,
	ProductItemInterval,
	type RolloverConfig,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import {
	constructArrearItem,
	constructArrearProratedItem,
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem";

// ═══════════════════════════════════════════════════════════════════
// BOOLEAN FEATURES
// ═══════════════════════════════════════════════════════════════════

/**
 * Boolean feature - on/off access (no usage tracking)
 * @returns Dashboard feature item
 */
const dashboard = () =>
	constructFeatureItem({
		featureId: TestFeature.Dashboard,
		isBoolean: true,
	});

/**
 * Boolean feature - admin rights access
 * @returns AdminRights feature item
 */
const adminRights = () =>
	constructFeatureItem({
		featureId: TestFeature.AdminRights,
		isBoolean: true,
	});

// ═══════════════════════════════════════════════════════════════════
// FREE METERED (included usage, resets monthly)
// ═══════════════════════════════════════════════════════════════════

/**
 * Monthly messages - resets each billing cycle
 * @param includedUsage - Free usage allowance (default: 100)
 * @param entityFeatureId - Entity feature ID for per-entity balances
 * @param resetUsageWhenEnabled - Whether to reset usage when enabled (default: undefined, uses server default)
 */
const monthlyMessages = ({
	includedUsage = 100,
	entityFeatureId,
	resetUsageWhenEnabled,
}: {
	includedUsage?: number;
	entityFeatureId?: string;
	resetUsageWhenEnabled?: boolean;
} = {}): LimitedItem => {
	const item = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage,
		entityFeatureId,
	}) as LimitedItem;

	if (resetUsageWhenEnabled !== undefined) {
		item.reset_usage_when_enabled = resetUsageWhenEnabled;
	}

	return item;
};

/**
 * Monthly words - resets each billing cycle
 * @param includedUsage - Free usage allowance (default: 100)
 * @param entityFeatureId - Entity feature ID for per-entity balances
 * @param resetUsageWhenEnabled - Whether to reset usage when enabled (default: undefined, uses server default)
 */
const monthlyWords = ({
	includedUsage = 100,
	entityFeatureId,
	resetUsageWhenEnabled,
}: {
	includedUsage?: number;
	entityFeatureId?: string;
	resetUsageWhenEnabled?: boolean;
} = {}): LimitedItem => {
	const item = constructFeatureItem({
		featureId: TestFeature.Words,
		includedUsage,
		entityFeatureId,
	}) as LimitedItem;

	if (resetUsageWhenEnabled !== undefined) {
		item.reset_usage_when_enabled = resetUsageWhenEnabled;
	}

	return item;
};

/**
 * Monthly credits - resets each billing cycle
 * @param includedUsage - Free usage allowance (default: 100)
 * @param rolloverConfig - Optional rollover configuration
 */
const monthlyCredits = ({
	includedUsage = 100,
	rolloverConfig,
}: {
	includedUsage?: number;
	rolloverConfig?: RolloverConfig;
} = {}): LimitedItem =>
	constructFeatureItem({
		featureId: TestFeature.Credits,
		includedUsage,
		rolloverConfig,
	}) as LimitedItem;

/**
 * Unlimited messages - no usage cap
 * @returns Unlimited messages feature item
 */
const unlimitedMessages = () =>
	constructFeatureItem({
		featureId: TestFeature.Messages,
		unlimited: true,
	});

/**
 * Monthly users - resets each billing cycle
 * @param includedUsage - Free usage allowance (default: 5)
 */
const monthlyUsers = ({
	includedUsage = 5,
}: {
	includedUsage?: number;
} = {}): LimitedItem =>
	constructFeatureItem({
		featureId: TestFeature.Users,
		includedUsage,
	}) as LimitedItem;

/**
 * Free users - allocated seats with no price (free tier)
 * @param includedUsage - Free seats included (default: 5)
 */
const freeUsers = ({
	includedUsage = 5,
}: {
	includedUsage?: number;
} = {}): LimitedItem =>
	constructFeatureItem({
		featureId: TestFeature.Users,
		includedUsage,
	}) as LimitedItem;

/**
 * Free allocated users - allocated seats with no price, usage carries over on product switch
 * @param includedUsage - Free seats included (default: 5)
 * @param entityFeatureId - Entity feature ID for per-entity balances
 */
const freeAllocatedUsers = ({
	includedUsage = 5,
	entityFeatureId,
}: {
	includedUsage?: number;
	entityFeatureId?: string;
} = {}): LimitedItem =>
	constructFeatureItem({
		featureId: TestFeature.Users,
		includedUsage,
		entityFeatureId,
	}) as LimitedItem;

/**
 * Free allocated workflows - allocated workflows with no price, usage carries over on product switch
 * @param includedUsage - Free workflows included (default: 5)
 * @param entityFeatureId - Entity feature ID for per-entity balances
 */
const freeAllocatedWorkflows = ({
	includedUsage = 5,
	entityFeatureId,
}: {
	includedUsage?: number;
	entityFeatureId?: string;
} = {}): LimitedItem =>
	constructFeatureItem({
		featureId: TestFeature.Workflows,
		includedUsage,
		entityFeatureId,
	}) as LimitedItem;

/**
 * Lifetime messages - never resets (interval: null)
 * @param includedUsage - One-time usage allowance (default: 100)
 */
const lifetimeMessages = ({
	includedUsage = 100,
}: {
	includedUsage?: number;
} = {}): LimitedItem =>
	constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage,
		interval: null,
	}) as LimitedItem;

/**
 * Monthly messages with rollover - unused balance rolls over to next cycle
 * @param includedUsage - Free usage allowance (default: 100)
 * @param rolloverConfig - Rollover configuration (max, length, duration)
 */
const monthlyMessagesWithRollover = ({
	includedUsage = 100,
	rolloverConfig,
}: {
	includedUsage?: number;
	rolloverConfig: RolloverConfig;
}): LimitedItem =>
	constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage,
		rolloverConfig,
	}) as LimitedItem;

// ═══════════════════════════════════════════════════════════════════
// PREPAID (purchase units upfront)
// ═══════════════════════════════════════════════════════════════════

/**
 * Generic prepaid item - purchase units upfront for any feature
 */
const prepaid = ({
	featureId,
	price = 10,
	billingUnits = 100,
	includedUsage = 0,
	config,
	entityFeatureId,
}: {
	featureId: string;
	price?: number;
	billingUnits?: number;
	includedUsage?: number;
	config?: ProductItemConfig;
	entityFeatureId?: string;
}): LimitedItem =>
	constructPrepaidItem({
		featureId,
		price,
		billingUnits,
		includedUsage,
		config,
		entityFeatureId,
	}) as LimitedItem;

/**
 * Prepaid messages - purchase units upfront ($10/unit)
 * @param includedUsage - Free units before purchase required (default: 0), billing units are 100
 * @param entityFeatureId - Entity feature ID for per-entity balances
 */
const prepaidMessages = ({
	includedUsage = 0,
	billingUnits = 100,
	price = 10,
	config,
	entityFeatureId,
}: {
	includedUsage?: number;
	billingUnits?: number;
	price?: number;
	config?: ProductItemConfig;
	entityFeatureId?: string;
} = {}): LimitedItem =>
	prepaid({
		featureId: TestFeature.Messages,
		price,
		billingUnits,
		includedUsage,
		config,
		entityFeatureId,
	});

/**
 * Prepaid users/seats - purchase seats upfront ($10/seat)
 * @param includedUsage - Free seats before purchase required (default: 0)
 */
const prepaidUsers = ({
	includedUsage = 0,
	billingUnits = 1,
}: {
	includedUsage?: number;
	billingUnits?: number;
} = {}): LimitedItem =>
	constructPrepaidItem({
		featureId: TestFeature.Users,
		price: 10,
		billingUnits,
		includedUsage,
	}) as LimitedItem;

/**
 * Tiered prepaid messages - volume pricing with tiers
 * Default tiers:
 * - 0-500 units: $10/pack (100 units/pack)
 * - 501+ units: $5/pack
 *
 * IMPORTANT: Last tier MUST have `to: "inf"` - Stripe requires a catch-all tier.
 *
 * @param includedUsage - Free units (default: 0)
 * @param billingUnits - Units per pack (default: 100)
 * @param tiers - Volume tiers (default: standard volume discount). Last tier must have `to: "inf"`.
 */
const tieredPrepaidMessages = ({
	includedUsage = 0,
	billingUnits = 100,
	tiers = [
		{ to: 500, amount: 10 },
		{ to: "inf", amount: 5 },
	],
	config,
}: {
	includedUsage?: number;
	billingUnits?: number;
	tiers?: { to: number | "inf"; amount: number }[];
	config?: ProductItemConfig;
} = {}): LimitedItem =>
	constructPrepaidItem({
		featureId: TestFeature.Messages,
		tiers: tiers as { to: number; amount: number }[],
		billingUnits,
		includedUsage,
		config,
	}) as LimitedItem;

// ═══════════════════════════════════════════════════════════════════
// ONE-OFF (interval: null, no recurring charges)
// ═══════════════════════════════════════════════════════════════════

/**
 * One-off messages - purchase units once (no recurring charges)
 * @param includedUsage - Free units included (default: 0)
 * @param billingUnits - Units per pack (default: 100)
 * @param price - Price per pack (default: 10)
 */
const oneOffMessages = ({
	includedUsage = 0,
	billingUnits = 100,
	price = 10,
}: {
	includedUsage?: number;
	billingUnits?: number;
	price?: number;
} = {}): LimitedItem =>
	constructPrepaidItem({
		featureId: TestFeature.Messages,
		price,
		billingUnits,
		includedUsage,
		isOneOff: true,
	}) as LimitedItem;

/**
 * One-off words - purchase units once (no recurring charges)
 * @param includedUsage - Free units included (default: 0)
 * @param billingUnits - Units per pack (default: 100)
 * @param price - Price per pack (default: 10)
 */
const oneOffWords = ({
	includedUsage = 0,
	billingUnits = 100,
	price = 10,
}: {
	includedUsage?: number;
	billingUnits?: number;
	price?: number;
} = {}): LimitedItem =>
	constructPrepaidItem({
		featureId: TestFeature.Words,
		price,
		billingUnits,
		includedUsage,
		isOneOff: true,
	}) as LimitedItem;

/**
 * One-off storage - purchase units once (no recurring charges)
 * @param includedUsage - Free units included (default: 0)
 * @param billingUnits - Units per pack (default: 100)
 * @param price - Price per pack (default: 10)
 */
const oneOffStorage = ({
	includedUsage = 0,
	billingUnits = 100,
	price = 10,
}: {
	includedUsage?: number;
	billingUnits?: number;
	price?: number;
} = {}): LimitedItem =>
	constructPrepaidItem({
		featureId: TestFeature.Storage,
		price,
		billingUnits,
		includedUsage,
		isOneOff: true,
	}) as LimitedItem;

/**
 * Tiered one-off messages - volume pricing with tiers (no recurring charges)
 * Default tiers:
 * - 0-500 units: $10/pack (100 units/pack)
 * - 501+ units: $5/pack
 *
 * IMPORTANT: Last tier MUST have `to: "inf"` - Stripe requires a catch-all tier.
 *
 * @param includedUsage - Free units (default: 0)
 * @param billingUnits - Units per pack (default: 100)
 * @param tiers - Volume tiers (default: standard volume discount). Last tier must have `to: "inf"`.
 */
const tieredOneOffMessages = ({
	includedUsage = 0,
	billingUnits = 100,
	tiers = [
		{ to: 500, amount: 10 },
		{ to: "inf", amount: 5 },
	],
}: {
	includedUsage?: number;
	billingUnits?: number;
	tiers?: { to: number | "inf"; amount: number }[];
} = {}): LimitedItem =>
	constructPrepaidItem({
		featureId: TestFeature.Messages,
		tiers,
		billingUnits,
		includedUsage,
		isOneOff: true,
	}) as LimitedItem;

// ═══════════════════════════════════════════════════════════════════
// CONSUMABLE / PAY-PER-USE (overage pricing)
// ═══════════════════════════════════════════════════════════════════

/**
 * Generic consumable item - pay-per-use overage for any feature
 * @param featureId - Feature ID
 * @param includedUsage - Free units before overage kicks in (default: 0)
 * @param price - Price per billing unit (default: 0.1)
 * @param billingUnits - Units per price (default: 1)
 * @param entityFeatureId - Entity feature ID for per-entity balances
 * @param interval - Billing interval (default: month)
 * @param maxPurchase - Maximum overage allowed (usage_limit = maxPurchase + includedUsage)
 */
const consumable = ({
	featureId,
	includedUsage = 0,
	price = 0.1,
	billingUnits = 1,
	entityFeatureId,
	interval = ProductItemInterval.Month,
	maxPurchase,
}: {
	featureId: string;
	includedUsage?: number;
	price?: number;
	billingUnits?: number;
	entityFeatureId?: string;
	interval?: ProductItemInterval;
	maxPurchase?: number;
}): LimitedItem =>
	constructArrearItem({
		featureId,
		includedUsage,
		price,
		billingUnits,
		entityFeatureId,
		interval,
		usageLimit:
			maxPurchase !== undefined ? maxPurchase + includedUsage : undefined,
	}) as LimitedItem;

/**
 * Consumable messages - pay-per-use overage ($0.10/unit)
 * @param includedUsage - Free units before overage kicks in (default: 0)
 * @param entityFeatureId - Entity feature ID for per-entity balances
 * @param interval - Billing interval (default: month)
 * @param maxPurchase - Maximum overage allowed (usage_limit = maxPurchase + includedUsage)
 * @param price - Price per unit (default: 0.1)
 */
const consumableMessages = ({
	includedUsage = 0,
	entityFeatureId,
	interval = ProductItemInterval.Month,
	maxPurchase,
	price = 0.1,
}: {
	includedUsage?: number;
	entityFeatureId?: string;
	interval?: ProductItemInterval;
	maxPurchase?: number;
	price?: number;
} = {}): LimitedItem =>
	consumable({
		featureId: TestFeature.Messages,
		includedUsage,
		price,
		billingUnits: 1,
		entityFeatureId,
		interval,
		maxPurchase,
	});

/**
 * Consumable words - pay-per-use overage ($0.05/unit)
 * @param includedUsage - Free units before overage kicks in (default: 0)
 * @param entityFeatureId - Entity feature ID for per-entity balances
 * @param interval - Billing interval (default: month)
 */
const consumableWords = ({
	includedUsage = 0,
	entityFeatureId,
	interval = ProductItemInterval.Month,
}: {
	includedUsage?: number;
	entityFeatureId?: string;
	interval?: ProductItemInterval;
} = {}): LimitedItem =>
	consumable({
		featureId: TestFeature.Words,
		includedUsage,
		price: 0.05,
		billingUnits: 1,
		entityFeatureId,
		interval,
	});

// ═══════════════════════════════════════════════════════════════════
// ALLOCATED / SEATS (prorated billing)
// ═══════════════════════════════════════════════════════════════════

/**
 * Allocated users/seats - prorated billing on change ($10/seat)
 * @param includedUsage - Free seats included (default: 0)
 */
const allocatedUsers = ({
	includedUsage = 0,
}: {
	includedUsage?: number;
} = {}): LimitedItem =>
	constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 10,
		includedUsage,
	}) as LimitedItem;

/**
 * Allocated workflows - prorated billing on change ($10/workflow)
 * @param includedUsage - Free workflows included (default: 0)
 */
const allocatedWorkflows = ({
	includedUsage = 0,
}: {
	includedUsage?: number;
} = {}): LimitedItem =>
	constructArrearProratedItem({
		featureId: TestFeature.Workflows,
		pricePerUnit: 10,
		includedUsage,
	}) as LimitedItem;

/**
 * Allocated messages - prorated billing on change ($10/unit)
 * @param includedUsage - Free messages included (default: 0)
 */
const allocatedMessages = ({
	includedUsage = 0,
}: {
	includedUsage?: number;
} = {}): LimitedItem =>
	constructArrearProratedItem({
		featureId: TestFeature.Messages,
		pricePerUnit: 10,
		includedUsage,
	}) as LimitedItem;

// ═══════════════════════════════════════════════════════════════════
// BASE PRICES
// ═══════════════════════════════════════════════════════════════════

/**
 * Monthly base price item
 * @param price - Monthly price (default: 20)
 */
const monthlyPrice = ({ price = 20 }: { price?: number } = {}) =>
	constructPriceItem({
		price,
		interval: BillingInterval.Month,
	});

/**
 * Annual base price item
 * @param price - Annual price (default: 200)
 */
const annualPrice = ({ price = 200 }: { price?: number } = {}) =>
	constructPriceItem({
		price,
		interval: BillingInterval.Year,
	});

/**
 * One-off base price item (no recurring charges)
 * @param price - One-time price (default: 50)
 */
const oneOffPrice = ({ price = 50 }: { price?: number } = {}) =>
	constructPriceItem({
		price,
		interval: null,
	});

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const items = {
	// Boolean
	dashboard,
	adminRights,

	// Free metered
	monthlyMessages,
	monthlyWords,
	monthlyCredits,
	monthlyUsers,
	freeUsers,
	freeAllocatedUsers,
	freeAllocatedWorkflows,
	unlimitedMessages,
	lifetimeMessages,
	monthlyMessagesWithRollover,

	// Prepaid
	prepaid,
	prepaidMessages,
	prepaidUsers,
	tieredPrepaidMessages,

	// One-off
	oneOffMessages,
	oneOffWords,
	oneOffStorage,
	tieredOneOffMessages,

	// Consumable
	consumable,
	consumableMessages,
	consumableWords,

	// Allocated
	allocatedUsers,
	allocatedWorkflows,
	allocatedMessages,

	// Base prices
	monthlyPrice,
	annualPrice,
	oneOffPrice,
} as const;
