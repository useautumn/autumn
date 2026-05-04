import { SetUsageParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getOrCreateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrCreateCachedFullSubject.js";
import { getOrCreateCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { runUpdateUsage } from "../updateBalance/runUpdateUsage.js";
import { updateUsageV2 } from "../updateBalance/v2/updateUsageV2.js";

export const handleSetUsage = createRoute({
	scopes: [Scopes.Balances.Write],
	body: SetUsageParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		if (isFullSubjectRolloutEnabled({ ctx })) {
			const fullSubject = await getOrCreateCachedFullSubject({
				ctx,
				params: {
					customer_id: body.customer_id,
					entity_id: body.entity_id,
				},
				source: "handleSetUsage",
			});

			await updateUsageV2({
				ctx,
				fullSubject,
				params: {
					customer_id: body.customer_id,
					feature_id: body.feature_id,
					usage: body.value,
					entity_id: body.entity_id,
				},
			});
		} else {
			const fullCustomer = await getOrCreateCachedFullCustomer({
				ctx,
				params: {
					customer_id: body.customer_id,
					entity_id: body.entity_id,
				},
				source: "handleSetUsage",
			});

			await runUpdateUsage({
				ctx,
				params: {
					customer_id: body.customer_id,
					feature_id: body.feature_id,
					usage: body.value,
					entity_id: body.entity_id,
				},
				fullCustomer,
			});
		}

		return c.json({ success: true });
	},
});
