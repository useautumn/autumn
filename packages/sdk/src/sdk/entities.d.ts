import { ClientSDK, RequestOptions } from "../lib/sdks.js";
import * as models from "../models/index.js";
export declare class Entities extends ClientSDK {
    /**
     * Creates an entity for a customer and feature, then returns the entity with balances and subscriptions.
     *
     * Use entities when usage and access must be scoped to sub-resources (for example seats, projects, or workspaces) instead of only the customer.
     *
     * @example
     * ```typescript
     * // Create a seat entity
     * const response = await client.entities.create({
     *
     *   customerId: "cus_123",
     *   entityId: "seat_42",
     *   featureId: "seats",
     *   name: "Seat 42",
     * });
     * ```
     *
     * @param name - The name of the entity (optional)
     * @param featureId - The ID of the feature this entity is associated with
     * @param billingControls - Billing controls for the entity. (optional)
     * @param customerData - Customer attributes used to resolve the customer when customer_id is not provided. (optional)
     * @param customerId - The ID of the customer to create the entity for.
     * @param entityId - The ID of the entity.
     *
     * @returns The created entity object including its current subscriptions, purchases, and balances.
     */
    create(request: models.CreateEntityParams, options?: RequestOptions): Promise<models.CreateEntityResponse>;
    /**
     * Fetches an entity by its ID.
     *
     * Use this to read one entity's current state. Pass customerId when you want to scope the lookup to a specific customer.
     *
     * @example
     * ```typescript
     * // Fetch a seat entity
     * const response = await client.entities.get({ entityId: "seat_42" });
     * ```
     *
     * @example
     * ```typescript
     * // Fetch a seat entity for a specific customer
     * const response = await client.entities.get({ customerId: "cus_123", entityId: "seat_42" });
     * ```
     *
     * @param customerId - The ID of the customer to create the entity for. (optional)
     * @param entityId - The ID of the entity.
     *
     * @returns The entity object including its current subscriptions, purchases, and balances.
     */
    get(request: models.GetEntityParams, options?: RequestOptions): Promise<models.GetEntityResponse>;
    /**
     * Updates an existing entity and returns the refreshed entity object.
     *
     * Use this to change entity billing controls or other mutable entity fields after the entity has already been created.
     *
     * @example
     * ```typescript
     * // Update a seat entity's billing controls
     * const response = await client.entities.update({ customerId: "cus_123", entityId: "seat_42", billingControls: {"spendLimits":[{"featureId":"messages","enabled":true,"overageLimit":25}]} });
     * ```
     *
     * @param customerId - The ID of the customer that owns the entity. (optional)
     * @param entityId - The ID of the entity.
     * @param billingControls - Billing controls to replace on the entity. (optional)
     *
     * @returns The updated entity object including its current subscriptions, purchases, and balances.
     */
    update(request: models.UpdateEntityParams, options?: RequestOptions): Promise<models.UpdateEntityResponse>;
    /**
     * Deletes an entity by entity ID.
     *
     * Use this when the underlying resource is removed and you no longer want entity-scoped balances or subscriptions tracked for it.
     *
     * @example
     * ```typescript
     * // Delete a seat entity
     * const response = await client.entities.delete({ entityId: "seat_42" });
     * ```
     *
     * @param customerId - The ID of the customer. (optional)
     * @param entityId - The ID of the entity.
     *
     * @returns A success flag indicating the entity was deleted.
     */
    delete(request: models.DeleteEntityParams, options?: RequestOptions): Promise<models.DeleteEntityResponse>;
}
