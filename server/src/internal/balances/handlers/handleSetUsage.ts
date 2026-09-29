import {
	ErrCode,
	fullSubjectToCustomerEntitlements,
	RecaseError,
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

// `/usage` on a feature the customer holds no balance for has always been a no-op success; a 404 makes clients retry.
const isNoBalanceForFeature = ({ error }: { error: unknown }): boolean =>
	error instanceof RecaseError &&
	error.code === ErrCode.CustomerEntitlementNotFound;

export const handleSetUsage = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	body: SetUsageParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		// Legacy `/usage` creates a missing customer, so the worker path does too.
		if (isBalanceWorkerRolloutEnabled({ ctx, customerId: body.customer_id })) {
			try {
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
			} catch (error) {
				if (!isNoBalanceForFeature({ error })) throw error;
			}
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

		const params = {
			customer_id: body.customer_id,
			feature_id: body.feature_id,
			usage: body.value,
			entity_id: body.entity_id,
		};
		validateInvoiceCreditBalanceMutationForFeature({
			customerEntitlements: fullSubjectToCustomerEntitlements({
				fullSubject,
				featureIds: [body.feature_id],
			}),
			featureId: body.feature_id,
		});

		await updateUsageV2({ ctx, fullSubject, params });

		return c.json({ success: true });
	},
});
