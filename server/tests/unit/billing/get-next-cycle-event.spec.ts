import { describe, expect, test } from "bun:test";
import {
	type BillingContext,
	BillingInterval,
	CusProductStatus,
	type FullCusProduct,
	getCycleEnd,
	ms,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { getNextCycleEvent } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/getNextCycleEvent";

const anchorMs = Date.UTC(2026, 0, 1);
const currentEpochMs = Date.UTC(2026, 0, 11);

const renewalBoundaryMs = getCycleEnd({
	anchor: anchorMs,
	interval: BillingInterval.Month,
	intervalCount: 1,
	now: currentEpochMs,
	floor: anchorMs,
});

const buildContext = (
	overrides: Partial<BillingContext> = {},
): BillingContext => ({
	...contexts.createBilling({ currentEpochMs, billingCycleAnchorMs: anchorMs }),
	...overrides,
});

const cusProduct = ({
	id,
	startsAt = anchorMs,
	endedAt,
	status = CusProductStatus.Active,
	entityId,
	trialEndsAt,
	oneOff = false,
	group,
}: {
	id: string;
	startsAt?: number;
	endedAt?: number | null;
	status?: CusProductStatus;
	entityId?: string;
	trialEndsAt?: number;
	oneOff?: boolean;
	group?: string;
}): FullCusProduct => {
	const price = oneOff
		? prices.createOneOff({ id: `price_${id}` })
		: prices.createFixed({ id: `price_${id}` });

	const product = products.createFull({
		id,
		prices: [price],
		isAddOn: id.includes("addon"),
	});

	return {
		...customerProducts.create({
			id,
			productId: id,
			internalEntityId: entityId,
			status,
			startsAt,
			endedAt,
			customerPrices: [
				prices.createCustomer({
					price,
					customerProductId: id,
				}),
			],
			product: group ? { ...product, group } : product,
		}),
		status,
		trial_ends_at: trialEndsAt,
	};
};

const resolve = ({
	billingContext = buildContext(),
	customerProducts = [],
}: {
	billingContext?: BillingContext;
	customerProducts?: FullCusProduct[];
} = {}) =>
	getNextCycleEvent({
		billingContext,
		customerProducts,
		anchorMs:
			billingContext.billingCycleAnchorMs === "now"
				? billingContext.currentEpochMs
				: billingContext.billingCycleAnchorMs,
	});

const productIds = (customerProducts: FullCusProduct[]) =>
	customerProducts.map((product) => product.id).sort();

describe("getNextCycleEvent", () => {
	test("keeps current behavior for an immediate new subscription with no future transition", () => {
		const event = resolve({
			billingContext: buildContext({ billingCycleAnchorMs: "now" }),
			customerProducts: [cusProduct({ id: "pro", startsAt: currentEpochMs })],
		});

		expect(event.kind).toBe("none");
	});

	test("returns renewal with all products active at the boundary", () => {
		const products = [
			cusProduct({ id: "entity-1-pro", entityId: "entity_1" }),
			cusProduct({ id: "entity-2-pro", entityId: "entity_2" }),
			cusProduct({ id: "addon", entityId: "entity_2" }),
			cusProduct({
				id: "expired-before-renewal",
				endedAt: currentEpochMs - ms.days(1),
			}),
		];

		const event = resolve({ customerProducts: products });

		expect(event.kind).toBe("renewal");
		if (event.kind === "renewal") {
			expect(event.startsAtMs).toBe(renewalBoundaryMs);
			expect(
				event.customerProducts.map((product) => product.id).sort(),
			).toEqual(["addon", "entity-1-pro", "entity-2-pro"]);
		}
	});

	test("future starts_at with no active products is a scheduled start", () => {
		const scheduledAt = currentEpochMs + ms.days(3);
		const incoming = cusProduct({
			id: "pro",
			startsAt: scheduledAt,
			status: CusProductStatus.Scheduled,
		});

		const event = resolve({
			billingContext: buildContext({ billingCycleAnchorMs: "now" }),
			customerProducts: [incoming],
		});

		expect(event.kind).toBe("scheduled_start");
		if (event.kind === "scheduled_start") {
			expect(event.startsAtMs).toBe(scheduledAt);
			expect(productIds(event.customerProducts)).toEqual([incoming.id]);
		}
	});

	test("future add-on start before renewal is an incoming-only scheduled start", () => {
		const scheduledAt = renewalBoundaryMs - ms.days(4);
		const active = cusProduct({ id: "pro" });
		const addon = cusProduct({
			id: "addon",
			startsAt: scheduledAt,
			status: CusProductStatus.Scheduled,
		});

		const event = resolve({ customerProducts: [active, addon] });

		expect(event.kind).toBe("scheduled_start");
		if (event.kind === "scheduled_start") {
			expect(event.startsAtMs).toBe(scheduledAt);
			expect(productIds(event.customerProducts)).toEqual([addon.id]);
		}
	});

	test("phase replacement before renewal is a scheduled change", () => {
		const scheduledAt = renewalBoundaryMs - ms.days(5);
		const pro = cusProduct({ id: "pro", endedAt: scheduledAt });
		const premium = cusProduct({
			id: "premium",
			startsAt: scheduledAt,
			status: CusProductStatus.Scheduled,
		});

		const event = resolve({ customerProducts: [pro, premium] });

		expect(event.kind).toBe("scheduled_change");
		if (event.kind === "scheduled_change") {
			expect(event.startsAtMs).toBe(scheduledAt);
			expect(productIds(event.incomingCustomerProducts)).toEqual([premium.id]);
			expect(productIds(event.outgoingCustomerProducts)).toEqual([pro.id]);
		}
	});

	test("same-group future phase is a scheduled change even before ended_at is patched", () => {
		const scheduledAt = renewalBoundaryMs - ms.days(5);
		const pro = cusProduct({ id: "pro", group: "main" });
		const premium = cusProduct({
			id: "premium",
			startsAt: scheduledAt,
			status: CusProductStatus.Scheduled,
			group: "main",
		});

		const event = resolve({ customerProducts: [pro, premium] });

		expect(event.kind).toBe("scheduled_change");
		if (event.kind === "scheduled_change") {
			expect(productIds(event.incomingCustomerProducts)).toEqual([premium.id]);
			expect(productIds(event.outgoingCustomerProducts)).toEqual([pro.id]);
		}
	});

	test("phase change at the renewal boundary is classified as renewal", () => {
		const pro = cusProduct({ id: "pro", endedAt: renewalBoundaryMs });
		const premium = cusProduct({
			id: "premium",
			startsAt: renewalBoundaryMs,
			status: CusProductStatus.Scheduled,
		});

		const event = resolve({ customerProducts: [pro, premium] });

		expect(event.kind).toBe("renewal");
		if (event.kind === "renewal") {
			expect(event.startsAtMs).toBe(renewalBoundaryMs);
			expect(productIds(event.customerProducts)).toEqual([premium.id]);
		}
	});

	test("trial end before renewal is the next event", () => {
		const trialEndsAt = currentEpochMs + ms.days(7);
		const pro = cusProduct({ id: "pro", trialEndsAt });
		const addon = cusProduct({ id: "addon", trialEndsAt });

		const event = resolve({
			billingContext: buildContext({
				trialContext: {
					trialEndsAt,
					appliesToBilling: true,
					cardRequired: true,
				},
			}),
			customerProducts: [pro, addon],
		});

		expect(event.kind).toBe("trial_end");
		if (event.kind === "trial_end") {
			expect(event.startsAtMs).toBe(trialEndsAt);
			expect(
				event.customerProducts.map((product) => product.id).sort(),
			).toEqual(["addon", "pro"]);
		}
	});

	test("phase transition wins over a later trial end", () => {
		const scheduledAt = currentEpochMs + ms.days(4);
		const trialEndsAt = currentEpochMs + ms.days(7);
		const pro = cusProduct({ id: "pro", endedAt: scheduledAt, trialEndsAt });
		const premium = cusProduct({
			id: "premium",
			startsAt: scheduledAt,
			status: CusProductStatus.Scheduled,
			trialEndsAt,
		});

		const event = resolve({
			billingContext: buildContext({
				trialContext: {
					trialEndsAt,
					appliesToBilling: true,
					cardRequired: true,
				},
			}),
			customerProducts: [pro, premium],
		});

		expect(event.kind).toBe("scheduled_change");
		if (event.kind === "scheduled_change") {
			expect(event.startsAtMs).toBe(scheduledAt);
		}
	});

	test("anchor reset before renewal is the next event", () => {
		const requestedBillingCycleAnchor = currentEpochMs + ms.days(5);
		const event = resolve({
			billingContext: buildContext({ requestedBillingCycleAnchor }),
			customerProducts: [cusProduct({ id: "pro" })],
		});

		expect(event.kind).toBe("anchor_reset");
	});

	test("renewal wins when requested anchor reset lands after renewal", () => {
		const requestedBillingCycleAnchor = renewalBoundaryMs + ms.days(5);
		const event = resolve({
			billingContext: buildContext({ requestedBillingCycleAnchor }),
			customerProducts: [cusProduct({ id: "pro" })],
		});

		expect(event.kind).toBe("renewal");
		if (event.kind === "renewal") {
			expect(event.startsAtMs).toBe(renewalBoundaryMs);
		}
	});

	test("discounts do not affect event selection", () => {
		const scheduledAt = renewalBoundaryMs - ms.days(5);
		const event = resolve({
			billingContext: buildContext({
				stripeDiscounts: [discounts.twentyPercentOff()],
			}),
			customerProducts: [
				cusProduct({ id: "pro", endedAt: scheduledAt }),
				cusProduct({
					id: "premium",
					startsAt: scheduledAt,
					status: CusProductStatus.Scheduled,
				}),
			],
		});

		expect(event.kind).toBe("scheduled_change");
	});

	test("returns none without a recurring interval", () => {
		const event = getNextCycleEvent({
			billingContext: buildContext(),
			customerProducts: [cusProduct({ id: "one-off", oneOff: true })],
			anchorMs,
		});

		expect(event.kind).toBe("none");
	});
});
