import { describe, expect, test } from "bun:test";
import { BillingInterval, BillWhen, CusProductStatus } from "@autumn/shared";
import { subjectToAutoTopupObjects } from "../../../src/trigger/subjectToAutoTopupObjects.js";
import type { AutoTopupSubject } from "../../../src/trigger/types/autoTopupSubject.js";
import {
	autoTopupFor,
	FEATURE,
	FUTURE,
	fixedPrice,
	legacyCustomerOf,
	NOW,
	oneOffPrepaidPlan,
	PAST,
	plan,
	row,
	subject,
	usagePrice,
} from "./fixtures/subjectFixtures.js";
import { fullCustomerToAutoTopupObjects } from "./legacy/fullCustomerToAutoTopupObjects.js";

/** The new function and the verbatim server copy must agree on every case; returns the new result. */
const objectsOf = (fullSubject: AutoTopupSubject, featureId = FEATURE) => {
	const next = subjectToAutoTopupObjects({ fullSubject, featureId, now: NOW });
	const legacy = fullCustomerToAutoTopupObjects({
		fullCustomer: legacyCustomerOf(fullSubject),
		featureId,
	});
	expect(next?.customerEntitlement.id).toBe(legacy?.customerEntitlement.id);
	expect(next?.balanceBelowThreshold).toBe(legacy?.balanceBelowThreshold);
	expect(next?.autoTopupConfig).toEqual(legacy?.autoTopupConfig);
	return next;
};

describe("config resolution", () => {
	test("O1 no config anywhere", () => {
		expect(
			objectsOf(subject({ plans: [oneOffPrepaidPlan({ id: "cp" })] })),
		).toBeNull();
	});

	test("O2 customer config disabled", () => {
		const s = subject({
			autoTopups: [autoTopupFor({ enabled: false })],
			plans: [oneOffPrepaidPlan({ id: "cp" })],
		});
		expect(objectsOf(s)).toBeNull();
	});

	test("O3 a disabled customer config shadows an enabled plan config", () => {
		const s = subject({
			autoTopups: [autoTopupFor({ enabled: false })],
			plans: [oneOffPrepaidPlan({ id: "cp", autoTopups: [autoTopupFor()] })],
		});
		expect(objectsOf(s)).toBeNull();
	});

	test("O4 config for another feature only", () => {
		const s = subject({
			autoTopups: [autoTopupFor({ featureId: "seats" })],
			plans: [oneOffPrepaidPlan({ id: "cp" })],
		});
		expect(objectsOf(s)).toBeNull();
	});

	test("O5 customer config wins over a plan config: no source plan, candidates ranked", () => {
		const s = subject({
			autoTopups: [autoTopupFor({ threshold: 5 })],
			plans: [
				oneOffPrepaidPlan({
					id: "cp_plan",
					createdAt: NOW - 5000,
					recurring: true,
					autoTopups: [autoTopupFor({ threshold: 99 })],
				}),
				oneOffPrepaidPlan({ id: "cp_topup", createdAt: NOW - 1000 }),
			],
		});
		const result = objectsOf(s);
		expect(result?.customerEntitlement.customer_product_id).toBe("cp_plan");
		expect(result?.autoTopupConfig.threshold).toBe(5);
	});

	test("O6 a plan config charges its own plan's row even when a cheaper one exists", () => {
		const s = subject({
			plans: [
				oneOffPrepaidPlan({
					id: "cp_source",
					createdAt: NOW - 5000,
					amount: 10,
					autoTopups: [autoTopupFor()],
				}),
				oneOffPrepaidPlan({ id: "cp_cheap", createdAt: NOW - 1000, amount: 1 }),
			],
		});
		expect(objectsOf(s)?.customerEntitlement.customer_product_id).toBe(
			"cp_source",
		);
	});

	test("O7 a plan config whose plan has no one-off prepaid row never falls back", () => {
		const s = subject({
			plans: [
				plan({
					id: "cp_source",
					autoTopups: [autoTopupFor()],
					prices: [fixedPrice({ id: "base", customerProductId: "cp_source" })],
					rows: [row({ id: "r_source", customerProductId: "cp_source" })],
				}),
				oneOffPrepaidPlan({ id: "cp_other" }),
			],
		});
		expect(objectsOf(s)).toBeNull();
	});

	test("O8 the most recently attached plan sources a plan config", () => {
		const s = subject({
			plans: [
				oneOffPrepaidPlan({
					id: "cp_old",
					createdAt: NOW - 5000,
					autoTopups: [autoTopupFor({ threshold: 1 })],
				}),
				oneOffPrepaidPlan({
					id: "cp_new",
					createdAt: NOW - 1000,
					autoTopups: [autoTopupFor({ threshold: 2 })],
				}),
			],
		});
		const result = objectsOf(s);
		expect(result?.customerEntitlement.customer_product_id).toBe("cp_new");
		expect(result?.autoTopupConfig.threshold).toBe(2);
	});
});

describe("charge source", () => {
	const enabled = [autoTopupFor()];

	test("S1 no rows for the feature", () => {
		expect(objectsOf(subject({ autoTopups: enabled }))).toBeNull();
	});

	test("S2 rows priced monthly prepaid, pay-per-use, or fixed one-off are never sources", () => {
		const monthlyPrepaid = plan({
			id: "cp_monthly",
			prices: [
				usagePrice({
					id: "p1",
					entitlementId: "ent_r1",
					customerProductId: "cp_monthly",
					interval: BillingInterval.Month,
				}),
			],
			rows: [row({ id: "r1", customerProductId: "cp_monthly" })],
		});
		const payPerUse = plan({
			id: "cp_ppu",
			prices: [
				usagePrice({
					id: "p2",
					entitlementId: "ent_r2",
					customerProductId: "cp_ppu",
					billWhen: BillWhen.EndOfPeriod,
				}),
			],
			rows: [row({ id: "r2", customerProductId: "cp_ppu" })],
		});
		const fixedOneOff = plan({
			id: "cp_fixed",
			prices: [
				fixedPrice({
					id: "p3",
					customerProductId: "cp_fixed",
					interval: BillingInterval.OneOff,
				}),
			],
			rows: [row({ id: "r3", customerProductId: "cp_fixed" })],
		});
		expect(
			objectsOf(
				subject({
					autoTopups: enabled,
					plans: [monthlyPrepaid, payPerUse, fixedOneOff],
				}),
			),
		).toBeNull();
	});

	test("S3 an expiring grant is never the source but its balance counts", () => {
		const s = subject({
			autoTopups: [autoTopupFor({ threshold: 20 })],
			plans: [oneOffPrepaidPlan({ id: "cp", balance: 5 })],
			extras: [row({ id: "grant", balance: 50, expiresAt: FUTURE })],
		});
		const result = objectsOf(s);
		expect(result?.customerEntitlement.id).toBe("row_cp");
		expect(result?.balanceBelowThreshold).toBe(false);
	});

	test("S4 only an expiring grant", () => {
		const s = subject({
			autoTopups: enabled,
			extras: [row({ id: "grant", expiresAt: FUTURE })],
		});
		expect(objectsOf(s)).toBeNull();
	});

	test("S6 rows on scheduled or expired products are ignored; past_due rows count", () => {
		const s = subject({
			autoTopups: enabled,
			plans: [
				plan({
					...oneOffPrepaidPlan({ id: "cp_sched" }),
					status: CusProductStatus.Scheduled,
				}),
				plan({
					...oneOffPrepaidPlan({ id: "cp_exp" }),
					status: CusProductStatus.Expired,
				}),
			],
		});
		expect(objectsOf(s)).toBeNull();

		const pastDue = subject({
			autoTopups: enabled,
			plans: [
				{
					...oneOffPrepaidPlan({ id: "cp_due" }),
					status: CusProductStatus.PastDue,
				},
			],
		});
		expect(objectsOf(pastDue)?.customerEntitlement.customer_product_id).toBe(
			"cp_due",
		);
	});

	test("S7 license seat assignment rows are ignored", () => {
		const seat = {
			...oneOffPrepaidPlan({ id: "cp_seat", balance: 0 }),
			internal_entity_id: "ent_1",
			customer_license_link_id: "link_1",
		};
		expect(
			objectsOf(subject({ autoTopups: enabled, plans: [seat] })),
		).toBeNull();
	});

	test("S8 entity-scoped rows pool up in a customer view", () => {
		const entityPlan = {
			...oneOffPrepaidPlan({ id: "cp_entity", balance: 100 }),
			internal_entity_id: "ent_1",
		};
		const s = subject({
			autoTopups: [autoTopupFor({ threshold: 20 })],
			plans: [
				oneOffPrepaidPlan({ id: "cp", balance: 0, createdAt: NOW - 1000 }),
				entityPlan,
			],
		});
		// 100 on the entity's row lifts the customer total over the threshold.
		expect(objectsOf(s)?.balanceBelowThreshold).toBe(false);
	});

	test("S9 an expired row is ignored; a future expiry counts", () => {
		const expired = subject({
			autoTopups: enabled,
			plans: [oneOffPrepaidPlan({ id: "cp", balance: 0 })],
			extras: [row({ id: "old", balance: 500, expiresAt: PAST })],
		});
		expect(objectsOf(expired)?.balanceBelowThreshold).toBe(true);

		const live = subject({
			autoTopups: enabled,
			plans: [oneOffPrepaidPlan({ id: "cp", balance: 0 })],
			extras: [row({ id: "live", balance: 500, expiresAt: FUTURE })],
		});
		expect(objectsOf(live)?.balanceBelowThreshold).toBe(false);
	});

	test("S10 an entity view with disable_pooled_balance reads only the entity's rows", () => {
		const entity = { id: "e1", internal_id: "ent_1", feature_id: "seats" };
		const entityRow = row({
			id: "r_entity",
			balance: 0,
			customerProductId: "cp_entity",
			internalEntityId: "ent_1",
		});
		const s = subject({
			autoTopups: enabled,
			config: { disable_pooled_balance: true },
			entity,
			plans: [
				oneOffPrepaidPlan({ id: "cp_customer", balance: 500 }),
				{
					...plan({
						id: "cp_entity",
						prices: [
							usagePrice({
								id: "pe",
								entitlementId: "ent_r_entity",
								customerProductId: "cp_entity",
							}),
						],
						rows: [entityRow],
					}),
					internal_entity_id: "ent_1",
				},
			],
		});
		const result = objectsOf(s);
		expect(result?.customerEntitlement.id).toBe("r_entity");
		expect(result?.balanceBelowThreshold).toBe(true);
	});

	test("S11 a pooled-balance source row is ignored", () => {
		const s = subject({
			autoTopups: enabled,
			plans: [oneOffPrepaidPlan({ id: "cp", balance: 0 })],
			pooled: [row({ id: "pool", balance: 500, pooled: true })],
		});
		expect(objectsOf(s)?.balanceBelowThreshold).toBe(true);
	});
});

describe("threshold", () => {
	const at = (balance: number, threshold: number) =>
		objectsOf(
			subject({
				autoTopups: [autoTopupFor({ threshold })],
				plans: [oneOffPrepaidPlan({ id: "cp", balance })],
			}),
		);

	test("T1 above threshold returns the objects with balanceBelowThreshold false", () => {
		const result = at(50, 20);
		expect(result?.customerEntitlement.id).toBe("row_cp");
		expect(result?.balanceBelowThreshold).toBe(false);
	});

	test("T2 equal to the threshold is below", () => {
		expect(at(20, 20)?.balanceBelowThreshold).toBe(true);
	});

	test("T3 threshold 0 with balance 0 is below", () => {
		expect(at(0, 0)?.balanceBelowThreshold).toBe(true);
	});

	test("T4 threshold 0 with balance 50 is not", () => {
		expect(at(50, 0)?.balanceBelowThreshold).toBe(false);
	});

	test("T5 rollovers count toward the balance", () => {
		const withRollover = oneOffPrepaidPlan({
			id: "cp",
			balance: 0,
			rollovers: [{ id: "ro", balance: 100, usage: 0, expires_at: FUTURE }],
		});
		const s = subject({
			autoTopups: [autoTopupFor({ threshold: 20 })],
			plans: [withRollover],
		});
		expect(objectsOf(s)?.balanceBelowThreshold).toBe(false);
	});

	test("T6 the balance sums every row of the feature, not only the source", () => {
		const s = subject({
			autoTopups: [autoTopupFor({ threshold: 20 })],
			plans: [
				oneOffPrepaidPlan({
					id: "cp_source",
					balance: 0,
					createdAt: NOW - 1000,
				}),
				oneOffPrepaidPlan({ id: "cp_old", balance: 30, createdAt: NOW - 5000 }),
			],
		});
		const result = objectsOf(s);
		expect(result?.customerEntitlement.customer_product_id).toBe("cp_source");
		expect(result?.balanceBelowThreshold).toBe(false);
	});
});
