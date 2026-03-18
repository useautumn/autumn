import { ClientSDK, RequestOptions } from "../lib/sdks.js";
import * as models from "../models/index.js";
export declare class Balances extends ClientSDK {
    /**
     * Create a balance for a customer feature.
     */
    create(request: models.CreateBalanceParams, options?: RequestOptions): Promise<models.CreateBalanceResponse>;
    /**
     * Update a customer balance.
     */
    update(request: models.UpdateBalanceParams, options?: RequestOptions): Promise<models.UpdateBalanceResponse>;
    /**
     * Delete a balance for a customer feature. Can only delete a balance that is not attached to a price (eg. you cannot delete messages that have an overage price).
     */
    delete(request: models.DeleteBalanceParams, options?: RequestOptions): Promise<models.DeleteBalanceResponse>;
    /**
     * Finalize a previously locked balance. Use 'confirm' to commit the deduction, or 'release' to return the held balance.
     */
    finalize(request: models.FinalizeBalanceParams, options?: RequestOptions): Promise<models.FinalizeLockResponse>;
}
