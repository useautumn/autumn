import { type AutumnBillingPlan, formatMs } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { ComputedSchedulePhase } from "../compute/computeSyncFuturePhases";

const formatCustomerProduct = (cp: {
	product_id: string;
	product: { name: string };
}) => `${cp.product.name} (${cp.product_id})`;

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

				upsertSubscription:
					autumnBillingPlan.upsertSubscription?.stripe_id ?? "none",

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
