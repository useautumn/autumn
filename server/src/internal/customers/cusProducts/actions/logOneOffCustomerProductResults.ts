import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { OneOffCustomerProductResult } from "./oneOffCustomerProductResult.js";

/** Logs one-off expiration operations to Axiom, grouped by organization. */
export const logOneOffCustomerProductResults = ({
	logger,
	results,
	label,
}: {
	logger: Logger;
	results: OneOffCustomerProductResult[];
	label: string;
}): void => {
	if (results.length === 0) {
		logger.info(`[${label}] No customer products found`);
		return;
	}

	const uniqueResults = [
		...new Map(
			results.map((result) => [result.customer_product.id, result]),
		).values(),
	];

	const byOrg = uniqueResults.reduce(
		(acc, result) => {
			const orgSlug = result.org.slug;
			if (!acc[orgSlug]) acc[orgSlug] = [];
			acc[orgSlug].push(result);
			return acc;
		},
		{} as Record<string, OneOffCustomerProductResult[]>,
	);

	logger.info(`[${label}] Starting`, {
		data: {
			totalCount: uniqueResults.length,
			orgCount: Object.keys(byOrg).length,
		},
	});

	for (const [orgSlug, orgResults] of Object.entries(byOrg)) {
		logger.info(`[${label}] Expiring customer products for org: ${orgSlug}`, {
			data: {
				orgSlug,
				orgId: orgResults[0].org.id,
				count: orgResults.length,
				customerProducts: orgResults.map((result) => ({
					customerProductId: result.customer_product.id,
					customerId: result.customer.id,
					customerInternalId: result.customer.internal_id,
					productId: result.product.id,
					productName: result.product.name,
					priceId: result.price.id,
					createdAt: result.customer_product.created_at,
				})),
			},
		});
	}

	logger.info(`[${label}] Completed`, {
		data: {
			totalExpired: uniqueResults.length,
		},
	});
};
