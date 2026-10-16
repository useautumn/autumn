import { orgToFeaturesByOrgEnv, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { getRedisTargetsForCustomer } from "@/external/redis/customerRedisRouting.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { batchInvalidateCachedFullSubjects } from "../cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects";
import { flushCachedSubjectBalances } from "../cache/fullSubject/actions/invalidate/flushCachedSubjectBalances";
import { deleteCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

const FLUSH_CONCURRENCY = 25;

export const handleClearCustomerCache = createRoute({
	scopes: [Scopes.Customers.Write],
	body: z.object({
		customer_id: z.string().optional(),
		customer_ids: z.array(z.string()).optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id, customer_ids } = c.req.valid("json");

		if (customer_id) {
			// Clearing the cache changes no balance, so pending deductions are flushed rather than dropped.
			await deleteCachedFullCustomer({
				customerId: customer_id,
				ctx,
				source: `handleClearCustomerCache, deleting single customer cache`,
				flushBalances: true,
			});
		}

		if (customer_ids) {
			// The batch unlink drops balance hashes whole, so each customer's pending deductions land first.
			for (
				let start = 0;
				start < customer_ids.length;
				start += FLUSH_CONCURRENCY
			) {
				await Promise.all(
					customer_ids
						.slice(start, start + FLUSH_CONCURRENCY)
						.map((customerId) =>
							flushCachedSubjectBalances({
								ctx,
								customerId,
								source: "handleClearCustomerCache",
							}),
						),
				);
			}

			const customersToDelete = customer_ids.map((id) => ({
				customerId: id,
				orgId: ctx.org.id,
				env: ctx.env,
			}));
			const featuresByOrgEnv = orgToFeaturesByOrgEnv({
				org: ctx.org,
				env: ctx.env,
				features: ctx.features,
			});

			await batchInvalidateCachedFullSubjects({
				customers: customersToDelete,
				featuresByOrgEnv,
				getRedisTargetsForCustomer: () =>
					getRedisTargetsForCustomer({
						org: ctx.org,
					}),
				logger: ctx.logger,
			});
		}

		return c.json({
			success: true,
		});
	},
});
