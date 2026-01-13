import {
	BillingInterval,
	type LimitedItem,
	type ProductItemConfig,
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

// ═══════════════════════════════════════════════════════════════════
// FREE METERED (included usage, resets monthly)
// ═══════════════════════════════════════════════════════════════════

/**
 * Monthly messages - resets each billing cycle
 * @param includedUsage - Free usage allowance (default: 100)
 */
const monthlyMessages = ({
	includedUsage = 100,
}: {
	includedUsage?: number;
} = {}): LimitedItem =>
	constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage,
	}) as LimitedItem;

/**
 * Monthly words - resets each billing cycle
 * @param includedUsage - Free usage allowance (default: 100)
 */
const monthlyWords = ({
	includedUsage = 100,
}: {
	includedUsage?: number;
} = {}): LimitedItem =>
	constructFeatureItem({
		featureId: TestFeature.Words,
		includedUsage,
	}) as LimitedItem;

/**
 * Monthly credits - resets each billing cycle
 * @param includedUsage - Free usage allowance (default: 100)
 */
const monthlyCredits = ({
	includedUsage = 100,
}: {
	includedUsage?: number;
} = {}): LimitedItem =>
	constructFeatureItem({
		featureId: TestFeature.Credits,
		includedUsage,
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
}: {
	featureId: string;
	price?: number;
	billingUnits?: number;
	includedUsage?: number;
	config?: ProductItemConfig;
}): LimitedItem =>
	constructPrepaidItem({
		featureId,
		price,
		billingUnits,
		includedUsage,
		config,
	}) as LimitedItem;

/**
 * Prepaid messages - purchase units upfront ($10/unit)
 * @param includedUsage - Free units before purchase required (default: 0), billing units are 100
 */
const prepaidMessages = ({
	includedUsage = 0,
	billingUnits = 100,
	price = 10,
	config,
}: {
	includedUsage?: number;
	billingUnits?: number;
	price?: number;
	config?: ProductItemConfig;
} = {}): LimitedItem =>
	prepaid({
		featureId: TestFeature.Messages,
		price,
		billingUnits,
		includedUsage,
		config,
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

// ═══════════════════════════════════════════════════════════════════
// CONSUMABLE / PAY-PER-USE (overage pricing)
// ═══════════════════════════════════════════════════════════════════

/**
 * Consumable messages - pay-per-use overage ($0.10/unit)
 * @param includedUsage - Free units before overage kicks in (default: 0)
 */
const consumableMessages = ({
	includedUsage = 0,
}: {
	includedUsage?: number;
} = {}): LimitedItem =>
	constructArrearItem({
		featureId: TestFeature.Messages,
		includedUsage,
		price: 0.1,
		billingUnits: 1,
	}) as LimitedItem;

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

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const items = {
	// Boolean
	dashboard,

	// Free metered
	monthlyMessages,
	monthlyWords,
	monthlyCredits,
	monthlyUsers,
	unlimitedMessages,
	lifetimeMessages,

	// Prepaid
	prepaid,
	prepaidMessages,
	prepaidUsers,

	// One-off
	oneOffMessages,

	// Consumable
	consumableMessages,

	// Allocated
	allocatedUsers,

	// Base prices
	monthlyPrice,
	annualPrice,
} as const;
