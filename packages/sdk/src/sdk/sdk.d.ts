import { ClientSDK, RequestOptions } from "../lib/sdks.js";
import * as models from "../models/index.js";
import { Balances } from "./balances.js";
import { Billing } from "./billing.js";
import { Customers } from "./customers.js";
import { Entities } from "./entities.js";
import { Events } from "./events.js";
import { Features } from "./features.js";
import { Plans } from "./plans.js";
import { Referrals } from "./referrals.js";
export declare class Autumn extends ClientSDK {
    private _customers?;
    get customers(): Customers;
    private _plans?;
    get plans(): Plans;
    private _features?;
    get features(): Features;
    private _billing?;
    get billing(): Billing;
    private _balances?;
    get balances(): Balances;
    private _events?;
    get events(): Events;
    private _entities?;
    get entities(): Entities;
    private _referrals?;
    get referrals(): Referrals;
    /**
     * Checks whether a customer currently has enough balance to use a feature.
     *
     * Use this to gate access before a feature action. Enable sendEvent when you want to check and consume balance atomically in one request.
     *
     * @example
     * ```typescript
     * // Check access for a feature
     * const response = await client.check({ customerId: "cus_123", featureId: "messages" });
     * ```
     *
     * @example
     * ```typescript
     * // Check and consume 3 units in one call
     * const response = await client.check({
     *
     *   customerId: "cus_123",
     *   featureId: "messages",
     *   requiredBalance: 3,
     *   sendEvent: true,
     * });
     * ```
     *
     * @param customerId - The ID of the customer.
     * @param featureId - The ID of the feature.
     * @param entityId - The ID of the entity for entity-scoped balances (e.g., per-seat limits). (optional)
     * @param requiredBalance - Minimum balance required for access. Returns allowed: false if the customer's balance is below this value. Defaults to 1. (optional)
     * @param properties - Additional properties to attach to the usage event if send_event is true. (optional)
     * @param sendEvent - If true, atomically records a usage event while checking access. The required_balance value is used as the usage amount. Combines check + track in one call. (optional)
     * @param lock - Reserve units of a feature upfront by passing a lock_id, then call balances.finalize to confirm or release the hold. (optional)
     * @param withPreview - If true, includes upgrade/upsell information in the response when access is denied. Useful for displaying paywalls. (optional)
     *
     * @returns Whether access is allowed, plus the current balance for that feature.
     */
    check(request: models.CheckParams, options?: RequestOptions): Promise<models.CheckResponse>;
    /**
     * Records usage for a customer feature and returns updated balances.
     *
     * Use this after an action happens to decrement usage, or send a negative value to credit balance back.
     *
     * @example
     * ```typescript
     * // Track one message event
     * const response = await client.track({ customerId: "cus_123", featureId: "messages", value: 1 });
     * ```
     *
     * @example
     * ```typescript
     * // Track an event mapped to multiple features
     * const response = await client.track({ customerId: "cus_123", eventName: "ai_chat_request", value: 1 });
     * ```
     *
     * @param customerId - The ID of the customer.
     * @param featureId - The ID of the feature to track usage for. Required if event_name is not provided. (optional)
     * @param entityId - The ID of the entity for entity-scoped balances (e.g., per-seat limits). (optional)
     * @param eventName - Event name to track usage for. Use instead of feature_id when multiple features should be tracked from a single event. (optional)
     * @param value - The amount of usage to record. Defaults to 1. Use negative values to credit balance (e.g., when removing a seat). (optional)
     * @param properties - Additional properties to attach to this usage event. (optional)
     *
     * @returns The usage value recorded, with either a single updated balance or a map of updated balances.
     */
    track(request: models.TrackParams, options?: RequestOptions): Promise<models.TrackResponse>;
}
