export const GENERAL_RATE_LIMIT = 1000; // per org
export const TRACK_RATE_LIMIT = 10000; // per customer ID
export const CHECK_RATE_LIMIT = 10000; // per customer ID
export const LIST_PRODUCTS_RATE_LIMIT = 20; // per org

// const TRACK_RATE_LIMIT = 10;
// const CHECK_RATE_LIMIT = 10;
// const GENERAL_RATE_LIMIT = 10;

export enum RateLimitType {
	General = "general",
	Track = "track",
	Check = "check",
	Events = "events",
	Attach = "attach",
	ListProducts = "list_products",
}
