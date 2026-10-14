import type Stripe from "stripe";

const ALLOWED_READ_METHODS = new Set([
	"retrieve",
	"list",
	"search",

	"listLineItems",
	"listUpcomingLineItems",
	"retrieveUpcoming",
	"listPaymentMethods",
	"retrievePaymentMethod",

	"retrieve",
	"retrieveTransaction",
	"listTransactions",
]);

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

function createResourceProxy(resource: any, resourceName: string): any {
	return new Proxy(resource, {
		get(target, prop: string) {
			const value = target[prop];

			if (typeof value !== "function") {
				return value;
			}

			if (!ALLOWED_READ_METHODS.has(prop)) {
				return () => {
					throw new ReadOnlyStripeError(resourceName, prop);
				};
			}

			return value.bind(target);
		},
	});
}

export function createReadOnlyStripeCli(stripeCli: Stripe): Stripe {
	return new Proxy(stripeCli, {
		get(target, prop: string) {
			const value = target[prop as keyof typeof target];

			if (value && typeof value === "object" && !Array.isArray(value)) {
				return createResourceProxy(value, prop);
			}

			return value;
		},
	}) as Stripe;
}
