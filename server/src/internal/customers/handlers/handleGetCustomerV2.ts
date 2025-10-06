import { ApiVersion, CusExpand, CusProductStatus } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getCusWithCache } from "../cusCache/getCusWithCache.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";
import { parseCusExpand } from "../cusUtils/cusUtils.js";

/**
 * GET /customers/:customer_id (V2 with versioning system)
 *
 * This is the NEW implementation using the versioning system.
 * DO NOT touch the old handleGetCustomer.ts until this is validated.
 *
 * Key differences:
 * 1. Each resource (customer/product/feature) handles its own versioning
 * 2. getApiCustomer/getApiCusProduct/getApiCusFeature apply version changes
 * 3. No version branching in handler logic
 * 4. Side effects handled explicitly (expand invoices for V1_0)
 */
export const handleGetCustomerV2 = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const customerId = c.req.param("customer_id");
		const { env, db, logger, org, features } = ctx;
		const { expand } = c.req.query();

		const expandArray = parseCusExpand(expand);

		// Side effect: V1_0 always expands invoices
		if (ctx.apiVersion.lt(ApiVersion.V1_1)) {
			expandArray.push(CusExpand.Invoices);
		}

		logger.info(`[V2] Getting customer ${customerId} for org ${org.slug}`);
		const startTime = Date.now();

		const fullCus = await getCusWithCache({
			db,
			idOrInternalId: customerId,
			org,
			env,
			expand: expandArray,
			logger,
			allowNotFound: false,
		});

		logger.info(`[V2] Get customer took ${Date.now() - startTime}ms`);

		// Get feature balances
		const inStatuses = org.config.include_past_due
			? [CusProductStatus.Active, CusProductStatus.PastDue]
			: [CusProductStatus.Active];

		const customer = await getApiCustomer({
			ctx,
			fullCus: fullCus,
		});

		return c.json(customer);

		// // Use getApiCustomer - it handles all versioning internally!
		// // - Calls getApiCusProduct for each product (builds latest + applies transforms)
		// // - Calls getApiCusFeature for features (field mapping + object↔array)
		// // - Applies customer-level changes (splits response for V1_0)
		// const customerResponse = await getApiCustomer({
		// 	customer,
		// 	cusProducts: customer.customer_products,
		// 	balances,
		// 	features,
		// 	apiVersion: ctx.apiVersion.semver,
		// 	invoices,
		// 	trialsUsed,
		// 	rewards,
		// 	entities,
		// 	referrals,
		// 	upcomingInvoice,
		// 	paymentMethod,
		// 	withAutumnId: with_autumn_id === "true",
		// });

		return c.json(customerResponse);
	},
});

// const balances = await getCusBalances({
// 	cusEntsWithCusProduct: cusEnts,
// 	cusPrices: cusProductsToCusPrices({
// 		cusProducts: customer.customer_products,
// 		inStatuses,
// 	}),
// 	org,
// 	apiVersion: ctx.apiVersion.semver as any, // TODO: fix type
// });

// // Fetch optional expanded fields
// const subIds = customer.customer_products.flatMap(
// 	(cp: any) => cp.subscription_ids || [],
// );

// const rewards = await getCusRewards({
// 	org,
// 	env,
// 	fullCus: customer,
// 	subIds,
// 	expand: expandArray,
// });

// const upcomingInvoice = await getCusUpcomingInvoice({
// 	db,
// 	org,
// 	env,
// 	fullCus: customer,
// 	expand: expandArray,
// });

// const referrals = await getCusReferrals({
// 	db,
// 	fullCus: customer,
// 	expand: expandArray,
// });

// const paymentMethod = await getCusPaymentMethodRes({
// 	org,
// 	env,
// 	fullCus: customer,
// 	expand: expandArray,
// });

// const invoices = expandArray.includes(CusExpand.Invoices)
// 	? invoicesToResponse({
// 			invoices: customer.invoices || [],
// 			logger,
// 		})
// 	: undefined;

// const entities = expandArray.includes(CusExpand.Entities)
// 	? customer.entities.map((e: any) => ({
// 			id: e.id,
// 			name: e.name,
// 			customer_id: customer.id,
// 			feature_id: e.feature_id,
// 			created_at: e.created_at,
// 			env: customer.env,
// 		}))
// 	: undefined;

// const trialsUsed = expandArray.includes(CusExpand.TrialsUsed)
// 	? customer.trials_used
// 	: undefined;

// const { with_autumn_id } = c.req.query();
