import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type SyncBillingContext,
	type SyncPhaseContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeSyncPlan } from "@/internal/billing/v2/actions/sync/compute/computeSyncPlan";

const queuedAddOn = {
	id: "cus_prod_queued_add_on",
	status: CusProductStatus.Scheduled,
} as unknown as FullCusProduct;

const emptyPhase = ({ startsAt }: { startsAt: number }): SyncPhaseContext => ({
	startsAt,
	endsAt: null,
	productContexts: [],
});

const syncContext = ({
	futurePhases,
}: {
	futurePhases: SyncPhaseContext[];
}): SyncBillingContext => ({
	customer_id: "customer_123",
	fullCustomer: {
		id: "customer_123",
		internal_id: "customer_internal_123",
		customer_products: [queuedAddOn],
		entities: [],
		extra_customer_entitlements: [],
	} as unknown as FullCustomer,
	stripeSubscription: null,
	stripeSchedule: null,
	currency: "usd",
	immediatePhase: null,
	futurePhases,
	unscheduledProductContexts: [],
	queuedCustomerProducts: [queuedAddOn],
	currentEpochMs: Date.now(),
	acknowledgedWarnings: [],
	carryOverUsage: true,
});

const ctx = {
	features: [],
	logger: { debug: () => undefined, info: () => undefined },
} as unknown as AutumnContext;

describe("computeSyncPlan queued products", () => {
	test("a sync that saves a new schedule deletes the plans the old one queued", () => {
		const now = Date.now();
		const { autumnBillingPlan } = computeSyncPlan({
			ctx,
			syncContext: syncContext({
				futurePhases: [
					emptyPhase({ startsAt: now + 86_400_000 }),
					emptyPhase({ startsAt: now + 2 * 86_400_000 }),
				],
			}),
		});

		expect(autumnBillingPlan.deleteCustomerProducts).toEqual([queuedAddOn]);
		// Otherwise the old schedule gets re-pointed at this sync's new plans,
		// and replacing that schedule then deletes them.
		expect(autumnBillingPlan.ownsSchedulePersistence).toBe(true);
	});

	test("a single-phase sync saves no schedule, so it deletes nothing", () => {
		const { autumnBillingPlan } = computeSyncPlan({
			ctx,
			syncContext: syncContext({
				futurePhases: [emptyPhase({ startsAt: Date.now() + 86_400_000 })],
			}),
		});

		expect(autumnBillingPlan.deleteCustomerProducts).toBeUndefined();
		expect(autumnBillingPlan.ownsSchedulePersistence).toBeUndefined();
	});
});
