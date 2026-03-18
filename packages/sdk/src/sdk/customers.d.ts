import { ClientSDK, RequestOptions } from "../lib/sdks.js";
import * as models from "../models/index.js";
export declare class Customers extends ClientSDK {
    /**
     * Creates a customer if they do not exist, or returns the existing customer by your external customer ID.
     *
     * Use this as the primary entrypoint before billing operations so the customer record is always present and up to date.
     *
     * @example
     * ```typescript
     * // Create or fetch a customer by external ID
     * const response = await client.getOrCreate({ customerId: "cus_123", name: "John Doe", email: "john@example.com" });
     * ```
     *
     * @param id - Your unique identifier for the customer (optional)
     * @param name - Customer's name (optional)
     * @param email - Customer's email address (optional)
     * @param fingerprint - Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse (optional)
     * @param metadata - Additional metadata for the customer (optional)
     * @param stripeId - Stripe customer ID if you already have one (optional)
     * @param createInStripe - Whether to create the customer in Stripe (optional)
     * @param autoEnablePlanId - The ID of the free plan to auto-enable for the customer (optional)
     * @param sendEmailReceipts - Whether to send email receipts to this customer (optional)
     * @param billingControls - Billing controls for the customer (auto top-ups, etc.) (optional)
     * @param expand - Fields to expand in the returned customer response, such as subscriptions.plan, purchases.plan, balances.feature, or flags.feature. (optional)
     */
    getOrCreate(request: models.GetOrCreateCustomerParams, options?: RequestOptions): Promise<models.Customer>;
    /**
     * Lists customers with pagination and optional filters.
     */
    list(request?: models.ListCustomersParams | undefined, options?: RequestOptions): Promise<models.ListCustomersResponse>;
    /**
     * Updates an existing customer by ID.
     */
    update(request: models.UpdateCustomerParams, options?: RequestOptions): Promise<models.UpdateCustomerResponse>;
    /**
     * Deletes a customer by ID.
     */
    delete(request: models.DeleteCustomerParams, options?: RequestOptions): Promise<models.DeleteCustomerResponse>;
}
