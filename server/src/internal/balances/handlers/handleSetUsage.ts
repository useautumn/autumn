import {
	fullSubjectToCustomerEntitlements,
	RouteGroup,
	Scopes,
	SetUsageParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { withCreateIfMissing } from "@/internal/balanceWorker/subject/withCreateIfMissing.js";
import { getOrCreateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrCreateCachedFullSubject.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { runBalanceWorkerUpdateBalance } from "../updateBalance/balanceWorker/runBalanceWorkerUpdateBalance.js";
import { updateUsageV2 } from "../updateBalance/v2/updateUsageV2.js";
import { validateInvoiceCreditBalanceMutationForFeature } from "../utils/validateInvoiceCreditBalanceMutation.js";

export const handleSetUsage = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	body: SetUsageParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		// Legacy `/usage` creates a missing customer, so the worker path does too.
		if (isBalanceWorkerRolloutEnabled({ ctx, customerId: body.customer_id })) {
			await withCreateIfMissing({
				ctx,
				customerId: body.customer_id,
				customerData: body.customer_data,
				entityId: body.entity_id,
				run: async () => {
					await runBalanceWorkerUpdateBalance({
						ctx,
						params: {
							customer_id: body.customer_id,
							feature_id: body.feature_id,
							entity_id: body.entity_id,
							usage: body.value,
						},
					});
					return { result: undefined, customer: null };
				},
			});
			return c.json({ success: true });
		}

		const fullSubject = await getOrCreateCachedFullSubject({
			ctx,
			params: {
				customer_id: body.customer_id,
				entity_id: body.entity_id,
			},
			source: "handleSetUsage",
		});

		validateInvoiceCreditBalanceMutationForFeature({
			customerEntitlements: fullSubjectToCustomerEntitlements({
				fullSubject,
				featureIds: [body.feature_id],
			}),
			featureId: body.feature_id,
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

		return c.json({ success: true });
	},
});
