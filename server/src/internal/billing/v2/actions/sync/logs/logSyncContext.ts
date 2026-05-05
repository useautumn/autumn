import { formatMs, type SyncBillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

const formatPhase = ({
	startsAt,
	productCount,
}: {
	startsAt: number;
	productCount: number;
}) => `${formatMs(startsAt)} (${productCount} plan${productCount === 1 ? "" : "s"})`;

export const logSyncContext = ({
	ctx,
	syncContext,
}: {
	ctx: AutumnContext;
	syncContext: SyncBillingContext;
}) => {
	const {
		customer_id,
		stripeSubscription,
		stripeSchedule,
		immediatePhase,
		futurePhases,
		currentEpochMs,
		acknowledgedWarnings,
	} = syncContext;

	addToExtraLogs({
		ctx,
		extras: {
			syncContext: {
				customer: customer_id,
				stripe: `${stripeSubscription?.id ?? "no sub"} | ${stripeSchedule?.id ?? "no schedule"}`,
				currentEpochMs: formatMs(currentEpochMs),
				immediatePhase: immediatePhase
					? formatPhase({
							startsAt: immediatePhase.startsAt,
							productCount: immediatePhase.productContexts.length,
						})
					: "none",
				futurePhases:
					futurePhases.length > 0
						? futurePhases
								.map((p) =>
									formatPhase({
										startsAt: p.startsAt,
										productCount: p.productContexts.length,
									}),
								)
								.join(" -> ")
						: "none",
				acknowledgedWarnings:
					acknowledgedWarnings.length > 0
						? acknowledgedWarnings.join(", ")
						: "none",
				productContexts: [
					...(immediatePhase ? immediatePhase.productContexts : []),
					...futurePhases.flatMap((p) => p.productContexts),
				]
					.map((pc) => {
						const customizeFlags = [
							pc.plan.customize?.price !== undefined && "price",
							pc.plan.customize?.items && "items",
							pc.plan.customize?.free_trial !== undefined && "trial",
						].filter(Boolean);
						const customize =
							customizeFlags.length > 0
								? ` customize=[${customizeFlags.join(",")}]`
								: "";
						const expire = pc.currentCustomerProduct
							? ` expire=${pc.currentCustomerProduct.id}`
							: "";
						const entity = pc.plan.internal_entity_id
							? ` entity=${pc.plan.internal_entity_id}`
							: "";
						return `${pc.fullProduct.id}${customize}${expire}${entity}`;
					})
					.join(" | "),
			},
		},
	});
};
