/**
 * How many API requests one call to the endpoint counts as.
 * `items` reads the batch size the server logs as `extras.item_count`.
 */
export type RequestWeight = "one_per_call" | "one_per_item";
