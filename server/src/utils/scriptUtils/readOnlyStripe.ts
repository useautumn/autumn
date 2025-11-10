import type Stripe from "stripe";

/**
 * List of allowed read-only Stripe methods.
 * These methods are safe to use during investigations as they don't modify data.
 */
const ALLOWED_READ_METHODS = new Set([
	// Resource retrieval methods
	"retrieve",
	"list",
	"search",

	// Specific read operations
	"listLineItems",
	"listUpcomingLineItems",
	"retrieveUpcoming",
	"listPaymentMethods",
	"retrievePaymentMethod",

	// Balance operations (read-only)
	"retrieve", // for balance
	"retrieveTransaction",
	"listTransactions",
]);

/**
 * Error thrown when attempting to use a write operation
 */
class ReadOnlyStripeError extends Error {
	constructor(resource: string, method: string) {
		super(
			`❌ BLOCKED: Attempted to call write method '${method}' on '${resource}'. ` +
				`Only read operations are allowed in investigation scripts. ` +
				`Allowed methods: retrieve, list, search`,
		);
		this.name = "ReadOnlyStripeError";
	}
}

/**
 * Creates a read-only proxy for a Stripe resource
 */
function createResourceProxy(resource: any, resourceName: string): any {
	return new Proxy(resource, {
		get(target, prop: string) {
			const value = target[prop];

			// Allow access to properties and non-function values
			if (typeof value !== "function") {
				return value;
			}

			// Check if method is allowed
			if (!ALLOWED_READ_METHODS.has(prop)) {
				// Return a function that throws an error
				return () => {
					throw new ReadOnlyStripeError(resourceName, prop);
				};
			}

			// Allow the read method
			return value.bind(target);
		},
	});
}

/**
 * Creates a read-only Stripe client that only allows safe read operations.
 * Any attempt to call write methods (create, update, delete, etc.) will throw an error.
 *
 * @example
 * ```typescript
 * const stripeCli = createReadOnlyStripeCli({ org, env });
 *
 * // ✅ These work
 * await stripeCli.invoices.retrieve("in_xxx");
 * await stripeCli.customers.list({ limit: 10 });
 *
 * // ❌ These throw ReadOnlyStripeError
 * await stripeCli.invoices.create({ customer: "cus_xxx" });
 * await stripeCli.customers.update("cus_xxx", { name: "New Name" });
 * ```
 */
export function createReadOnlyStripeCli(stripeCli: Stripe): Stripe {
	return new Proxy(stripeCli, {
		get(target, prop: string) {
			const value = target[prop as keyof typeof target];

			// If accessing a resource (customers, invoices, etc.)
			if (value && typeof value === "object" && !Array.isArray(value)) {
				return createResourceProxy(value, prop);
			}

			// Allow direct access to other properties
			return value;
		},
	}) as Stripe;
}
