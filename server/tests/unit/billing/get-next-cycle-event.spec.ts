import { describe, expect, test } from "bun:test";
import {
	type BillingContext,
	BillingInterval,
	type FullCusProduct,
	getCycleEnd,
	ms,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { getNextCycleEvent } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/getNextCycleEvent";

const anchorMs = Date.UTC(2026, 0, 1);
const currentEpochMs = Date.UTC(2026, 0, 11);
const smallestInterval = { interval: BillingInterval.Month, intervalCount: 1 };

const renewalBoundaryMs = getCycleEnd({
	anchor: anchorMs,
	interval: BillingInterval.Month,
	intervalCount: 1,
	now: currentEpochMs,
	floor: anchorMs,
});

const endedProduct = (endedAt: number): FullCusProduct =>
	({ ended_at: endedAt }) as FullCusProduct;

const buildContext = (
	overrides: Partial<BillingContext> = {},
): BillingContext => ({
	...contexts.createBilling({ currentEpochMs, billingCycleAnchorMs: anchorMs }),
	...overrides,
});

const resolve = ({
	billingContext,
	scheduledStartMs = null,
	currentCustomerProducts = [],
	scheduledStartCustomerProducts = [],
}: {
	billingContext: BillingContext;
	scheduledStartMs?: number | null;
	currentCustomerProducts?: FullCusProduct[];
	scheduledStartCustomerProducts?: FullCusProduct[];
}) =>
	getNextCycleEvent({
		billingContext,
		customerProducts: [],
		currentCustomerProducts,
		scheduledStartMs,
		scheduledStartCustomerProducts,
		smallestInterval,
		anchorMs,
	});

describe("getNextCycleEvent", () => {
	test("anchor=now with no scheduled change is a no-op", () => {
		const event = resolve({
			billingContext: buildContext({ billingCycleAnchorMs: "now" }),
		});
		expect(event.kind).toBe("none");
	});

	test("a requested anchor reset defers to the anchor-reset preview", () => {
		const event = resolve({
			billingContext: buildContext({ requestedBillingCycleAnchor: anchorMs }),
			scheduledStartMs: renewalBoundaryMs - ms.days(3),
		});
		expect(event.kind).toBe("anchor_reset");
	});

	test("non-backdate: a scheduled change before renewal still renews (not a swap)", () => {
		const event = resolve({
			billingContext: buildContext(),
			scheduledStartMs: renewalBoundaryMs - ms.days(3),
			currentCustomerProducts: [endedProduct(renewalBoundaryMs - ms.days(3))],
		});
		expect(event.kind).toBe("renewal");
		if (event.kind === "renewal") {
			expect(event.at).toBe(renewalBoundaryMs);
		}
	});

	test("backdate: a scheduled change before renewal is a prorated swap", () => {
		const scheduledStartMs = renewalBoundaryMs - ms.days(5);
		const incoming = [{ id: "incoming" } as unknown as FullCusProduct];
		const event = resolve({
			billingContext: buildContext({
				subscriptionBackdateStartMs: anchorMs,
			}),
			scheduledStartMs,
			currentCustomerProducts: [endedProduct(scheduledStartMs)],
			scheduledStartCustomerProducts: incoming,
		});
		expect(event.kind).toBe("scheduled_change");
		if (event.kind === "scheduled_change") {
			expect(event.at).toBe(scheduledStartMs);
			expect(event.incomingCustomerProducts).toBe(incoming);
			expect(event.outgoingCustomerProducts).toHaveLength(1);
		}
	});

	test("backdate: a scheduled change at the renewal boundary stays a renewal", () => {
		const event = resolve({
			billingContext: buildContext({ subscriptionBackdateStartMs: anchorMs }),
			scheduledStartMs: renewalBoundaryMs,
			currentCustomerProducts: [endedProduct(renewalBoundaryMs)],
		});
		expect(event.kind).toBe("renewal");
	});

	test("backdate: a scheduled change within the boundary second stays a renewal", () => {
		const event = resolve({
			billingContext: buildContext({ subscriptionBackdateStartMs: anchorMs }),
			scheduledStartMs: renewalBoundaryMs + 250,
			currentCustomerProducts: [endedProduct(renewalBoundaryMs)],
		});
		expect(event.kind).toBe("renewal");
	});

	test("backdate: no scheduled change renews at the boundary", () => {
		const event = resolve({
			billingContext: buildContext({ subscriptionBackdateStartMs: anchorMs }),
			scheduledStartMs: null,
		});
		expect(event.kind).toBe("renewal");
		if (event.kind === "renewal") {
			expect(event.at).toBe(renewalBoundaryMs);
		}
	});

	test("backdate: a scheduled change with no current product renews instead of swapping", () => {
		const event = resolve({
			billingContext: buildContext({ subscriptionBackdateStartMs: anchorMs }),
			scheduledStartMs: renewalBoundaryMs - ms.days(5),
			currentCustomerProducts: [],
		});
		expect(event.kind).toBe("renewal");
	});
});
