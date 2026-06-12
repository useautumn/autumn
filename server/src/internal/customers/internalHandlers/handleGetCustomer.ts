import {
	ALL_STATUSES,
	CustomerExpand,
	type FullCusProduct,
	Scopes,
} from "@autumn/shared";
import { getTestClockFrozenTimeMs } from "@/external/stripe/testClocks/utils/convertStripeTestClock";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";
import { getCusAutoTopupPurchaseLimits } from "@/internal/customers/cusUtils/cusResponseUtils/getCusAutoTopupPurchaseLimits";
import { getCusRewards } from "@/internal/customers/cusUtils/cusResponseUtils/getCusRewards";
import { getCusUsageLimitsWithUsage } from "@/internal/customers/cusUtils/cusResponseUtils/getCusUsageLimitsWithUsage";

/**
 * Internal route for get full customer object.
 *
 * Note: schedules are NOT hydrated here. Dashboard consumers that need the
 * customer's persisted schedule must fetch it separately via
 * `GET /customers/:customer_id/schedule`.
 *
 * Supports optional `?expand=rewards` query param to lazily fetch
 * per-subscription discount data from Stripe.
 */
export const handleGetCustomer = createRoute({
	scopes: [Scopes.Customers.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.param();

		const expandParam = c.req.query("expand");
		const entityId = c.req.query("entity_id");
		const extraExpands = expandParam
			? (expandParam.split(",").filter(Boolean) as CustomerExpand[])
			: [];
		const expand = [CustomerExpand.Invoices, ...extraExpands];

		const fullCus = await CusService.getFull({
			ctx,
			idOrInternalId: customer_id,
			withEntities: true,
			expand,
			inStatuses: ALL_STATUSES,
			entityId: entityId || undefined,
		});

		const [
			testClockFrozenTimeMs,
			autoTopupsWithLimits,
			rewards,
			usageLimitsWithUsage,
		] = await Promise.all([
			getTestClockFrozenTimeMs({
				ctx,
				stripeCustomerId: fullCus.processor?.id,
			}),
			getCusAutoTopupPurchaseLimits({
				ctx,
				internalCustomerId: fullCus.internal_id,
				autoTopupsConfig: fullCus.auto_topups,
				expand: [CustomerExpand.AutoTopupsPurchaseLimit],
			}),
			getCusRewards({
				org: ctx.org,
				env: ctx.env,
				fullCus,
				subIds: fullCus.customer_products.flatMap(
					(cp: FullCusProduct) => cp.subscription_ids || [],
				),
				expand,
			}),
			getCusUsageLimitsWithUsage({ ctx, fullCus }),
		]);

		// Overlay usage onto the customer and every entity that has caps, so the
		// pill shows usage regardless of which scope the client fetched.
		const entities = usageLimitsWithUsage
			? fullCus.entities?.map((entity) => {
					const decorated =
						usageLimitsWithUsage.byInternalEntityId[entity.internal_id];
					return decorated ? { ...entity, usage_limits: decorated } : entity;
				})
			: fullCus.entities;

		return c.json({
			customer: {
				...fullCus,
				auto_topups: autoTopupsWithLimits ?? fullCus.auto_topups,
				rewards: rewards ?? undefined,
				entities: entities ?? fullCus.entities,
				usage_limits: usageLimitsWithUsage?.customer ?? fullCus.usage_limits,
			},
			test_clock_frozen_time_ms: testClockFrozenTimeMs,
		});
	},
});
