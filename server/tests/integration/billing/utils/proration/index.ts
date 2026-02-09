/**
 * Proration utilities for billing tests.
 *
 * These utilities fetch billing period directly from Stripe and calculate
 * exact prorated amounts for mid-cycle upgrades, downgrades, and other
 * subscription changes.
 *
 * Key concepts:
 * - Base prices, prepaid, and allocated features are ALL prorated on upgrade
 * - Consumable/arrear charges are NEVER prorated (pay full amount for usage)
 *
 * @example
 * // Same-interval upgrade (Pro $20 → Premium $50)
 * const charge = await calculateProratedDiff({
 *   customerId,
 *   advancedTo,
 *   oldAmount: 20,
 *   newAmount: 50,
 * });
 * expect(preview.total).toBeCloseTo(charge, 0);
 *
 * @example
 * // Cross-interval upgrade (Monthly $20 → Annual $200)
 * const charge = await calculateCrossIntervalUpgrade({
 *   customerId,
 *   advancedTo,
 *   oldAmount: 20,   // Monthly
 *   newAmount: 200,  // Annual
 * });
 * expect(preview.total).toBeCloseTo(charge, 0);
 *
 * @example
 * // Mixed: prorated base + non-prorated arrear
 * const proratedBase = await calculateProratedDiff({
 *   customerId,
 *   advancedTo,
 *   oldAmount: 20,
 *   newAmount: 50,
 * });
 * const arrearOverage = 5; // 100 overage × $0.05 (NOT prorated)
 * expect(preview.total).toBeCloseTo(proratedBase + arrearOverage, 0);
 */

export { calculateCrossIntervalUpgrade } from "./calculateCrossIntervalUpgrade";
export { calculateProratedDiff } from "./calculateProratedDiff";
export {
	calculateProration,
	calculateProrationFromPeriod,
} from "./calculateProration";
export {
	type BillingPeriod,
	type GetBillingPeriodResult,
	getBillingPeriod,
} from "./getBillingPeriod";
