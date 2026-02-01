import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { OneOffCleanupResult } from "./getOneOffToCleanup.js";

/**
 * Logs the one-off cleanup operation to Axiom.
 * Groups cleanup results by organization for cleaner logs.
 */
export const logOneOffCleanup = ({
	logger,
	cleanupResults,
}: {
	logger: Logger;
	cleanupResults: OneOffCleanupResult[];
}): void => {
	if (cleanupResults.length === 0) {
		logger.info("[One-off Cleanup] No customer products to cleanup");
		return;
	}

	// Group by organization for cleaner logging
	const byOrg = cleanupResults.reduce(
		(acc, result) => {
			const orgSlug = result.org.slug;
			if (!acc[orgSlug]) {
				acc[orgSlug] = [];
			}
			acc[orgSlug].push(result);
			return acc;
		},
		{} as Record<string, OneOffCleanupResult[]>,
	);

	logger.info("[One-off Cleanup] Starting cleanup", {
		data: {
			totalCount: cleanupResults.length,
			orgCount: Object.keys(byOrg).length,
		},
	});

	// Log each organization's cleanup
	for (const [orgSlug, results] of Object.entries(byOrg)) {
		const cleanupDetails = results.map((result) => ({
			customerProductId: result.customer_product.id,
			customerId: result.customer.id,
			customerInternalId: result.customer.internal_id,
			productId: result.product.id,
			productName: result.product.name,
			priceId: result.price.id,
			createdAt: result.customer_product.created_at,
		}));

		logger.info(
			`[One-off Cleanup] Expiring customer products for org: ${orgSlug}`,
			{
				data: {
					orgSlug,
					orgId: results[0].org.id,
					count: results.length,
					customerProducts: cleanupDetails,
				},
			},
		);
	}

	logger.info("[One-off Cleanup] Cleanup completed", {
		data: {
			totalExpired: cleanupResults.length,
		},
	});
};
