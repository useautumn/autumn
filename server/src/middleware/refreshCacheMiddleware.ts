import type { AutumnContext } from "../honoUtils/HonoEnv.js";
import { deleteCachedApiCustomer } from "../internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";

const cusPrefixedUrls = [
	{
		method: "POST",
		url: "/customers/:customer_id",
		type: "delete",
	},
	{
		method: "DELETE",
		url: "/customers/:customer_id",
		type: "delete",
	},
	{
		method: "POST",
		url: "/customers/:customer_id/balances",
		type: "delete",
	},
	{
		method: "POST",
		url: "/customers/:customer_id/entitlements/:customer_entitlement_id",
		type: "delete",
	},
	{
		method: "POST",
		url: "/customers/:customer_id/balances",
		type: "delete",
	},
	{
		method: "POST",
		url: "/customers/:customer_id/entities",
		type: "delete",
	},
	{
		method: "DELETE",
		url: "/customers/:customer_id/entities/:entity_id",
		type: "delete",
	},
	{
		method: "POST",
		url: "/customers/:customer_id/transfer_product",
		type: "delete",
	},
];

const matchesCusPrefixedUrl = (url: string, method: string) => {
	return cusPrefixedUrls.find((urlObj) => {
		// Check if method matches
		if (urlObj.method !== method) {
			return false;
		}

		const regexPattern = urlObj.url
			.replace(/:[^/]+/g, "([^/]+)") // Replace :param with capturing group
			.replace(/\//g, "\\/"); // Escape forward slashes

		const regex = new RegExp(`^${regexPattern}$`);
		return regex.test(url);
	});
};

const coreUrls = [
	{
		method: "POST",
		url: "/attach",
		type: "delete",
	},
	{
		method: "POST",
		url: "/cancel",
		type: "delete",
	},
];

const handleRefreshCache = async (req: any, res: any) => {
	const { logger } = req;

	// Construct a minimal ctx from the Express request
	const ctx = {
		org: req.org,
		env: req.env,
		logger: req.logger,
		db: req.db,
		features: req.features || [],
	} as AutumnContext;

	const pathMatch = matchesCusPrefixedUrl(
		req.originalUrl.replace("/v1", ""),
		req.method,
	);

	if (pathMatch) {
		const customerId = req.params.customer_id || req.params.customerId;
		logger.info(
			`Clearing cache for customer ${customerId}, url: ${req.originalUrl}`,
		);

		await deleteCachedApiCustomer({
			customerId,
			ctx,
			source: `refreshCacheMiddleware, url: ${req.originalUrl} (express)`,
		});
	}

	const coreMatch = coreUrls.find(
		(urlObj) =>
			urlObj.url === req.originalUrl.replace("/v1", "") &&
			urlObj.method === req.method,
	);

	if (coreMatch && req.body.customer_id) {
		logger.info(`Clearing cache for core url ${req.originalUrl}`);

		await deleteCachedApiCustomer({
			customerId: req.body.customer_id,
			ctx,
			source: `refreshCacheMiddleware, core url: ${req.originalUrl} (express)`,
		});
	}
};

export const refreshCacheMiddleware = async (req: any, res: any, next: any) => {
	// Replace res.send...
	const originalSend = res.send;
	res.send = async (body: any) => {
		await handleRefreshCache(req, res);
		await originalSend.call(res, body);
	};

	next();
};
