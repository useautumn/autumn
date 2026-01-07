import { TestFeature } from "@tests/setup/v2Features";
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
} = {}) =>
	constructFeatureItem({ featureId: TestFeature.Messages, includedUsage });

/**
 * Monthly words - resets each billing cycle
 * @param includedUsage - Free usage allowance (default: 100)
 */
const monthlyWords = ({
	includedUsage = 100,
}: {
	includedUsage?: number;
} = {}) =>
	constructFeatureItem({ featureId: TestFeature.Words, includedUsage });

/**
 * Monthly credits - resets each billing cycle
 * @param includedUsage - Free usage allowance (default: 100)
 */
const monthlyCredits = ({
	includedUsage = 100,
}: {
	includedUsage?: number;
} = {}) =>
	constructFeatureItem({ featureId: TestFeature.Credits, includedUsage });

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
 * Lifetime messages - never resets (interval: null)
 * @param includedUsage - One-time usage allowance (default: 100)
 */
const lifetimeMessages = ({
	includedUsage = 100,
}: {
	includedUsage?: number;
} = {}) =>
	constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage,
		interval: null,
	});

// ═══════════════════════════════════════════════════════════════════
// PREPAID (purchase units upfront)
// ═══════════════════════════════════════════════════════════════════

/**
 * Prepaid messages - purchase units upfront ($10/unit)
 * @param includedUsage - Free units before purchase required (default: 0)
 */
const prepaidMessages = ({
	includedUsage = 0,
}: {
	includedUsage?: number;
} = {}) =>
	constructPrepaidItem({
		featureId: TestFeature.Messages,
		price: 10,
		billingUnits: 1,
		includedUsage,
	});

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
} = {}) =>
	constructArrearItem({
		featureId: TestFeature.Messages,
		includedUsage,
		price: 0.1,
		billingUnits: 1,
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
} = {}) =>
	constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 10,
		includedUsage,
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
	unlimitedMessages,
	lifetimeMessages,

	// Prepaid
	prepaidMessages,

	// Consumable
	consumableMessages,

	// Allocated
	allocatedUsers,
} as const;
