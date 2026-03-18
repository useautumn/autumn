import { ClientSDK, RequestOptions } from "../lib/sdks.js";
import * as models from "../models/index.js";
export declare class Events extends ClientSDK {
    /**
     * List usage events for your organization. Filter by customer, feature, or time range.
     */
    list(request: models.EventsListParams, options?: RequestOptions): Promise<models.ListEventsResponse>;
    /**
     * Aggregate usage events by time period. Returns usage totals grouped by feature and optionally by a custom property.
     */
    aggregate(request: models.EventsAggregateParams, options?: RequestOptions): Promise<models.AggregateEventsResponse>;
}
