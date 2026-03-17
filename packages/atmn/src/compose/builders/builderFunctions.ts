// AUTO-GENERATED - DO NOT EDIT MANUALLY
// Generated from @autumn/shared schemas
// Run `pnpm gen:atmn` to regenerate

import type { Plan, PlanItem, FreeTrial } from "../models/planModels.js";
import type { Feature } from "../models/featureModels.js";

type PlanInput = Omit<Plan, 'description' | 'addOn' | 'autoEnable' | 'group'> & Partial<Pick<Plan, 'description' | 'addOn' | 'autoEnable' | 'group'>>;

/**
 * Define a pricing plan in your Autumn configuration
 *
 * @param p - Plan configuration
 * @returns Plan object for use in autumn.config.ts
 *
 * @example
 * export const pro = plan({
 *   id: 'pro',
 *   name: 'Pro Plan',
 *   description: 'For growing teams',
 *   items: [
 *     item({ featureId: seats.id, included: 10 }),
 *     item({
 *       featureId: messages.id,
 *       included: 1000,
 *       reset: { interval: 'month' }
 *     })
 *   ],
 *   price: { amount: 50, interval: 'month' }
 * });
 */
export const plan = (params: PlanInput): Plan => {
  return {
    ...params,
    description: params.description ?? null,
    addOn: params.addOn ?? false,
    autoEnable: params.autoEnable ?? false,
    group: params.group ?? ""
  };
};

/**
 * Define a feature that can be included in plans
 *
 * @param f - Feature configuration
 * @returns Feature object for use in autumn.config.ts
 *
 * @example
 * // Metered consumable feature (like API calls, tokens)
 * export const apiCalls = feature({
 *   id: 'api_calls',
 *   name: 'API Calls',
 *   type: 'metered',
 *   consumable: true
 * });
 *
 * @example
 * // Metered non-consumable feature (like seats)
 * export const seats = feature({
 *   id: 'seats',
 *   name: 'Team Seats',
 *   type: 'metered',
 *   consumable: false
 * });
 */
export const feature = (params: Feature): Feature => {
  return params;
};

/**
 * Include a feature in a plan with specific configuration
 *
 * @param config - Feature configuration for this plan
 * @returns PlanItem for use in plan's items array
 *
 * @example
 * // Simple included usage
 * item({
 *   featureId: messages.id,
 *   included: 1000,
 *   reset: { interval: 'month' }
 * })
 *
 * @example
 * // Priced feature with tiers
 * item({
 *   featureId: seats.id,
 *   included: 5,
 *   reset: { interval: 'month' },
 *   price: {
 *     tiers: [
 *       { to: 10, amount: 10 },
 *       { to: 'inf', amount: 8 }
 *     ],
 *     billingMethod: 'usage_based',
 *     billingUnits: 1
 *   }
 * })
 */
export const item = (params: PlanItem): PlanItem => {
  return params;
};
