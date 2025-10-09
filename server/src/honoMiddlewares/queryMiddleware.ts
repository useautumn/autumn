import type { MiddlewareHandler } from "hono";
import qs from "qs";

/**
 * Middleware to parse query strings using the `qs` library
 * This handles comma-separated arrays automatically and complex nested objects
 *
 * Examples:
 * - ?expand=invoices,rewards → { expand: ['invoices', 'rewards'] }
 * - ?expand[0]=invoices&expand[1]=rewards → { expand: ['invoices', 'rewards'] }
 * - ?filter[status]=active → { filter: { status: 'active' } }
 *
 * Add this middleware before your route validators:
 * ```ts
 * router.use(queryMiddleware());
 * router.get('/customers/:id', validator('query', GetCustomerQuerySchema), handler);
 * ```
 */
export const queryMiddleware = (): MiddlewareHandler => {
	return async (c, next) => {
		const url = new URL(c.req.url);
		const queryString = url.search.slice(1); // Remove leading '?'

		if (queryString) {
			// Parse with comma support for arrays
			const parsed = qs.parse(queryString, {
				comma: true, // Enable comma-separated array parsing
				depth: 5, // Limit depth to prevent prototype pollution
				allowDots: false, // Disable dot notation (filter.status) to prevent confusion
				decoder: (str, defaultDecoder, charset, type) => {
					// Use default decoder but handle edge cases
					if (type === "value") {
						// Handle boolean strings
						if (str === "true") return true;
						if (str === "false") return false;
						// Handle numbers if needed (optional)
						// const num = Number(str);
						// if (!isNaN(num) && str === String(num)) return num;
					}
					return defaultDecoder(str, defaultDecoder, charset);
				},
			});

			// Store parsed query for Hono to use
			// @ts-expect-error - Hono's query parsing internals
			c.req.query = (key?: string) => {
				if (key) {
					return parsed[key];
				}
				return parsed;
			};
		}

		await next();
	};
};
