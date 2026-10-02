import {
	ALLOCATION_USAGE_WINDOW_FILTER_KEY,
	allocationGate,
	allocationGranted,
	CustomerNotFoundError,
	cusEntsToBalance,
	effectiveAllocationScale,
	fullSubjectToCustomerEntitlements,
	isSameUsageWindow,
	type UsageWindow,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { readAllocationCounters } from "../repos/allocationStore.js";
import { allocationCycleOf, sharedRowsOf } from "../utils/allocationRows.js";

/** Counter usage by internal entity id ("" = the claimed total) from the cached subject's live windows. */
const liveCounters = ({
	usageWindows,
	internalFeatureId,
	cycle,
}: {
	usageWindows: UsageWindow[];
	internalFeatureId: string;
	cycle: { windowStartAt: number; windowEndAt: number };
}) =>
	Object.fromEntries(
		usageWindows
			.filter(
				(window) =>
					window.filter_key === ALLOCATION_USAGE_WINDOW_FILTER_KEY &&
					window.internal_feature_id === internalFeatureId &&
					isSameUsageWindow({
						usageWindow: window,
						window: {
							window_start_at: cycle.windowStartAt,
							window_end_at: cycle.windowEndAt,
						},
					}),
			)
			.map((window) => [window.internal_entity_id ?? "", Number(window.usage)]),
	) as Record<string, number>;

/** Every allocated feature's counters (cache and Postgres) and each entity's gate, for admin QA. */
export const getAllocationState = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) => {
	const fullSubject = await getOrSetCachedFullSubject({
		ctx,
		customerId,
		source: "allocationState",
	});
	if (!fullSubject) throw new CustomerNotFoundError({ customerId });
	const allocations = fullSubject.customer.balance_allocations ?? {};
	const entities = await EntityService.list({
		db: ctx.db,
		internalCustomerId: fullSubject.customer.internal_id,
	});
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
	});
	const now = Date.now();

	const features = [];
	for (const [internalFeatureId, allocation] of Object.entries(allocations)) {
		const sharedRows = sharedRowsOf({
			customerEntitlements,
			featureId: allocation.feature_id,
			interval: allocation.interval,
		});
		const cycle = allocationCycleOf({
			sharedRows,
			interval: allocation.interval,
			now,
			pinnedId: allocation.parent_customer_entitlement_id,
		});
		if (!cycle) continue;

		const cache = liveCounters({
			usageWindows: fullSubject.usage_windows ?? [],
			internalFeatureId,
			cycle,
		});
		const db = await readAllocationCounters({
			tx: ctx.db,
			internalCustomerId: fullSubject.customer.internal_id,
			internalFeatureId,
			cycle,
		});
		const sharedRemaining = cusEntsToBalance({ cusEnts: sharedRows });
		const claimed = cache[""] ?? 0;
		const requestedTotal = Object.values(allocation.amounts).reduce(
			(sum, amount) => sum.plus(amount),
			new Decimal(0),
		);
		const scale = effectiveAllocationScale({
			allocation,
			cycleEnd: cycle.windowEndAt,
			parentId: cycle.parentId,
			sharedRemaining,
			claimed,
			requestedTotal: requestedTotal.toNumber(),
		});
		const heldUnused = requestedTotal.minus(claimed).toNumber();
		// The same rule the engines apply: a cut stops binding once every unused promise fits.
		const bindingScale = heldUnused <= sharedRemaining ? 1 : scale;
		const gateFor = (requested: number | null, usage: number) =>
			allocationGate({
				own: requested === null ? null : { requested, usage },
				scale,
				heldUnused,
				sharedRemaining,
			});
		const pool = gateFor(null, 0);

		const rows = entities
			.filter((entity) => !entity.deleted)
			.map((entity) => {
				const requested = allocation.amounts[entity.internal_id] ?? null;
				const usage = cache[entity.internal_id] ?? 0;
				const gate = gateFor(requested, usage);
				const canDraw = new Decimal(gate.ownUnused).plus(gate.unallocated);
				return {
					entity_id: entity.id,
					name: entity.name,
					requested,
					granted:
						requested === null
							? null
							: allocationGranted({ requested, usage, scale: bindingScale }),
					usage_cache: usage,
					usage_db: db[entity.internal_id] ?? 0,
					own_unused: gate.ownUnused,
					can_draw: canDraw.toNumber(),
					blocked: canDraw.lte(0),
				};
			});

		features.push({
			feature_id: allocation.feature_id,
			interval: allocation.interval,
			window: { start: cycle.windowStartAt, end: cycle.windowEndAt },
			parent_customer_entitlement_id: cycle.parentId,
			scale: { stored: allocation.scale, effective: bindingScale },
			shared: {
				remaining: sharedRemaining,
				requested_total: requestedTotal.toNumber(),
				claimed_cache: claimed,
				claimed_db: db[""] ?? 0,
				unallocated: pool.unallocated,
			},
			entities: rows,
		});
	}
	return { customer_id: customerId, features };
};
