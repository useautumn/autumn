import {
	type AutumnBillingPlan,
	formatMs,
	type Subscription,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { ComputedSchedulePhase } from "../compute/computeSyncFuturePhases";

const formatSubscriptionIds = (subscriptions?: Subscription[]) => {
	if (!subscriptions?.length) return "none";
	return subscriptions.map((subscription) => subscription.stripe_id).join(", ");
};

const formatCustomerProduct = (cp: { product: { id: string; name: string } }) =>
	`${cp.product.name} (${cp.product.id})`;

export const logSyncPlan = ({
	ctx,
	autumnBillingPlan,
	phases,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	phases: ComputedSchedulePhase[];
}) => {
	addToExtraLogs({
		ctx,
		extras: {
			syncPlan: {
				insertCustomerProducts:
					autumnBillingPlan.insertCustomerProducts
						.map(formatCustomerProduct)
						.join(", ") || "none",

				updateCustomerProducts:
					(autumnBillingPlan.updateCustomerProducts ?? [])
						.map(
							(u) =>
								`${formatCustomerProduct(u.customerProduct)} -> ${u.updates.status ?? "n/a"}`,
						)
						.join(", ") || "none",

				customPrices:
					(autumnBillingPlan.customPrices ?? []).length > 0
						? `${(autumnBillingPlan.customPrices ?? []).length} custom price(s)`
						: "none",

				customEntitlements:
					(autumnBillingPlan.customEntitlements ?? []).length > 0
						? `${(autumnBillingPlan.customEntitlements ?? []).length} custom ent(s)`
						: "none",

				upsertSubscriptions: formatSubscriptionIds(
					autumnBillingPlan.upsertSubscriptions,
				),

				schedulePhases:
					phases.length > 0
						? phases
								.map(
									(p) =>
										`${formatMs(p.startsAt)} (${p.customerProductIds.length} cusProduct${p.customerProductIds.length === 1 ? "" : "s"})`,
								)
								.join(" -> ")
						: "none",
			},
		},
	});
};
