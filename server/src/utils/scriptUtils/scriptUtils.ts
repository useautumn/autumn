import "dotenv/config";
import fs from "node:fs";
import { ApiVersion, ApiVersionClass, type AppEnv } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { subHours } from "date-fns";
import type { Stripe } from "stripe";
import { db } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createLogger } from "@/external/logtail/logtailUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { timeout } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { createReadOnlyStripeCli } from "./readOnlyStripe.js";

export const getAllStripeCustomers = async ({
	numPages,
	limit = 100,
	stripeCli,
}: {
	numPages?: number;
	limit?: number;
	stripeCli: Stripe;
}) => {
	let hasMore = true;
	let startingAfter: string | null = null;
	const allCustomers: any[] = [];

	let pageCount = 0;
	while (hasMore) {
		const response: any = await stripeCli.customers.list({
			limit,
			starting_after: startingAfter || undefined,
		});

		allCustomers.push(...response.data);

		hasMore = response.has_more;

		startingAfter = response.data[response.data.length - 1].id;

		pageCount++;
		if (numPages && pageCount >= numPages) {
			break;
		}
	}

	return {
		customers: allCustomers,
		total: allCustomers.length,
	};
};

export const getAllStripeSubscriptions = async ({
	numPages,
	limit = 100,
	stripeCli,
	waitForSeconds,
}: {
	numPages?: number;
	limit?: number;
	stripeCli: Stripe;
	waitForSeconds?: number;
}) => {
	let hasMore = true;
	let startingAfter: string | null = null;
	const allSubscriptions: any[] = [];

	let pageCount = 0;
	while (hasMore) {
		const response: any = await stripeCli.subscriptions.list({
			limit,
			starting_after: startingAfter || undefined,
			expand: ["data.discounts"],
		});

		allSubscriptions.push(...response.data);

		hasMore = response.has_more;
		startingAfter = response.data[response.data.length - 1].id;

		pageCount++;
		if (numPages && pageCount >= numPages) {
			break;
		}

		console.log("Fetched", allSubscriptions.length, "subscriptions");
		if (waitForSeconds) {
			await timeout(1000);
		}
	}

	return {
		subscriptions: allSubscriptions,
		total: allSubscriptions.length,
	};
};

export const getAllStripeProducts = async ({
	numPages,
	limit = 100,
	stripeCli,
	includeInactive = true,
}: {
	numPages?: number;
	limit?: number;
	stripeCli: Stripe;
	includeInactive?: boolean;
}) => {
	const fetchProducts = async (active?: boolean) => {
		let hasMore = true;
		let startingAfter: string | null = null;
		const products: Stripe.Product[] = [];

		let pageCount = 0;
		while (hasMore) {
			const response: Stripe.ApiList<Stripe.Product> =
				await stripeCli.products.list({
					limit,
					starting_after: startingAfter || undefined,
					...(active !== undefined && { active }),
				});

			products.push(...response.data);

			hasMore = response.has_more;
			if (response.data.length > 0) {
				startingAfter = response.data[response.data.length - 1].id;
			} else {
				hasMore = false;
			}

			pageCount++;
			if (numPages && pageCount >= numPages) {
				break;
			}

			console.log(
				`Fetched ${products.length} ${active === false ? "inactive" : "active"} products`,
			);
			await timeout(500);
		}

		return products;
	};

	const activeProducts = await fetchProducts(true);
	const inactiveProducts = includeInactive ? await fetchProducts(false) : [];

	const allProducts = [...activeProducts, ...inactiveProducts];

	return {
		products: allProducts,
		total: allProducts.length,
	};
};

export const getCusSubsAndProducts = async (path: string) => {
	const customers = JSON.parse(
		fs.readFileSync(`${path}/customers.json`, "utf8"),
	) as Stripe.Customer[];
	const subs = JSON.parse(
		fs.readFileSync(`${path}/subscriptions.json`, "utf8"),
	) as Stripe.Subscription[];
	const products = JSON.parse(fs.readFileSync(`${path}/products.json`, "utf8"));

	return { customers, subs, products };
};

export const saveCusSubsAndProducts = async ({
	stripeCli,
	path,
	orgId,
	env,
	skipProducts = false,
	skipSubs = false,
}: {
	stripeCli: Stripe;
	path: string;
	orgId: string;
	env: AppEnv;
	skipProducts?: boolean;
	skipSubs?: boolean;
}) => {
	// Create directory if it doesn't exist
	if (!fs.existsSync(path)) {
		fs.mkdirSync(path, { recursive: true });
	}

	if (!skipProducts) {
		console.log("Fetching products...");

		const { products } = await getAllStripeProducts({
			stripeCli,
			includeInactive: true,
		});
		fs.writeFileSync(
			`${path}/products.json`,
			JSON.stringify(products, null, 2),
		);
	}

	// console.log("Fetching customers...");
	// const { customers } = await getAllStripeCustomers({
	// 	stripeCli,
	// });
	// fs.writeFileSync(
	// 	`${path}/customers.json`,
	// 	JSON.stringify(customers, null, 2),
	// );

	console.log("Fetching subscriptions...");
	if (!skipSubs) {
		const { subscriptions } = await getAllStripeSubscriptions({
			stripeCli,
		});

		fs.writeFileSync(
			`${path}/subscriptions.json`,
			JSON.stringify(subscriptions, null, 2),
		);
	}
};

export const initScript = async ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => {
	const [org, autumnProducts, features] = await Promise.all([
		OrgService.get({ db, orgId }),
		ProductService.listFull({
			db,
			orgId,
			env,
		}),
		FeatureService.list({
			db,
			orgId,
			env,
		}),
	]);

	const stripeCli: Stripe = createStripeCli({ org, env });

	const logger = createLogger();

	const req: ExtendedRequest = {
		orgId,
		env,
		org,
		db,
		features,
		logger,
		apiVersion: new ApiVersionClass(ApiVersion.V1_2),
	} as unknown as ExtendedRequest;

	return { stripeCli, autumnProducts, req };
};

/**
 * Initializes a read-only script context for safe investigations.
 * This variant wraps the Stripe client in a read-only proxy that blocks all write operations.
 *
 * Use this for investigation scripts to prevent accidental data modifications.
 *
 * @example
 * ```typescript
 * const { stripeCli, autumnProducts, req } = await initReadScript({ orgId, env });
 *
 * // ✅ Read operations work
 * await stripeCli.invoices.retrieve("in_xxx");
 *
 * // ❌ Write operations throw ReadOnlyStripeError
 * await stripeCli.invoices.create({ customer: "cus_xxx" });
 * ```
 */
export const initReadScript = async ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => {
	const [org, autumnProducts, features] = await Promise.all([
		OrgService.get({ db, orgId }),
		ProductService.listFull({
			db,
			orgId,
			env,
		}),
		FeatureService.list({
			db,
			orgId,
			env,
		}),
	]);

	const stripeCliRaw: Stripe = createStripeCli({ org, env });
	const stripeCli = createReadOnlyStripeCli(stripeCliRaw);

	const logger = createLogger();

	const req: ExtendedRequest = {
		orgId,
		env,
		org,
		db,
		features,
		logger,
		apiVersion: new ApiVersionClass(ApiVersion.V1_2),
	} as unknown as ExtendedRequest;

	return { stripeCli, autumnProducts, req };
};

export const getFirstOfNextMonthUnix = (hoursToSub?: number) => {
	let firstOfNextMonth = new UTCDate(new Date());

	const nextMonth = firstOfNextMonth.getUTCMonth() + 1;
	firstOfNextMonth.setUTCDate(1);
	firstOfNextMonth.setUTCHours(12, 0, 0, 0);
	firstOfNextMonth.setUTCMonth(nextMonth);

	if (hoursToSub) {
		firstOfNextMonth = subHours(firstOfNextMonth, hoursToSub);
	}

	return firstOfNextMonth.getTime();
};
