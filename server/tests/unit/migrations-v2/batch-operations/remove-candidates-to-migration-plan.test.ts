import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import type { RemoveCandidateRow } from "@/internal/migrations/v2/batchOperations/actions/removeCustomerEntitlementsForPage/selectRemoveCandidateRows.js";
import { removeCandidatesToMigrationPlan } from "@/internal/migrations/v2/batchOperations/actions/removeCustomerEntitlementsThroughWorker/removeCandidatesToMigrationPlan.js";
import { isHeldByWorker } from "@/internal/migrations/v2/batchOperations/actions/throughWorker/isHeldByWorker.js";

const candidate = (
	overrides: Partial<RemoveCandidateRow> = {},
): RemoveCandidateRow => ({
	customerEntitlementId: "cus_ent_messages",
	customerProductId: "cus_prod_free",
	internalCustomerId: "cus_internal_1",
	entityId: null,
	status: CusProductStatus.Active,
	startsAt: 1_700_000_000_000,
	canceledAt: null,
	endedAt: null,
	trialEndsAt: null,
	liveBalance: 60,
	liveNextResetAt: 1_800_000_000_000,
	entitlementId: "ent_messages_100",
	ownerInternalEntityId: null,
	ownerEntityId: null,
	internalProductId: "prod_internal_free",
	productIsCustom: false,
	productLoadedByWorker: true,
	customerPriceIds: [],
	...overrides,
});

describe("removeCandidatesToMigrationPlan", () => {
	test("each grant becomes a delete guarded by the entitlement SQL read and by holding no rollovers", () => {
		const plan = removeCandidatesToMigrationPlan({ rows: [candidate()] });
		expect(plan).toEqual({
			entityIds: [],
			ops: [
				{
					op: "delete",
					table: "customerEntitlements",
					id: "cus_ent_messages",
					expect: { entitlement_id: "ent_messages_100" },
					withoutRollovers: true,
					expectProduct: {
						columns: {
							internal_product_id: "prod_internal_free",
							status: CusProductStatus.Active,
							is_custom: false,
						},
						customerPriceIds: [],
					},
				},
			],
			catalogRows: [],
		});
	});

	test("names each owning entity once, by external id", () => {
		const plan = removeCandidatesToMigrationPlan({
			rows: [
				candidate({
					customerEntitlementId: "cus_ent_a",
					ownerInternalEntityId: "ent_internal_seat_1",
					ownerEntityId: "seat_1",
				}),
				candidate({
					customerEntitlementId: "cus_ent_b",
					ownerInternalEntityId: "ent_internal_seat_1",
					ownerEntityId: "seat_1",
				}),
				candidate({ customerEntitlementId: "cus_ent_c" }),
			],
		});
		expect(plan.entityIds).toEqual(["seat_1"]);
		expect(plan.ops.map((op) => ("id" in op ? op.id : null))).toEqual([
			"cus_ent_a",
			"cus_ent_b",
			"cus_ent_c",
		]);
	});

	test("a grant two remove filters both matched is deleted once", () => {
		const plan = removeCandidatesToMigrationPlan({
			rows: [candidate(), candidate()],
		});
		expect(plan.ops).toHaveLength(1);
	});
});

describe("isHeldByWorker", () => {
	test("customer-level grants and grants of a named entity are held by the worker", () => {
		expect(isHeldByWorker({ row: candidate() })).toBe(true);
		expect(
			isHeldByWorker({
				row: candidate({
					ownerInternalEntityId: "ent_internal_seat_1",
					ownerEntityId: "seat_1",
				}),
			}),
		).toBe(true);
	});

	test("a grant on a product the worker doesn't load isn't held, whatever the product's own status", () => {
		expect(
			isHeldByWorker({
				row: candidate({
					status: CusProductStatus.Paused,
					productLoadedByWorker: false,
				}),
			}),
		).toBe(false);
		expect(
			isHeldByWorker({
				row: candidate({
					ownerInternalEntityId: "ent_internal_seat_1",
					ownerEntityId: "seat_1",
					status: CusProductStatus.Active,
					productLoadedByWorker: false,
				}),
			}),
		).toBe(false);
	});

	test("a seat the worker loads through its live parent is held even when its own status lags", () => {
		expect(
			isHeldByWorker({
				row: candidate({
					ownerInternalEntityId: "ent_internal_seat_1",
					ownerEntityId: "seat_1",
					status: CusProductStatus.Expired,
					productLoadedByWorker: true,
				}),
			}),
		).toBe(true);
	});

	test("a grant of an entity with no external id has no subject on the worker", () => {
		expect(
			isHeldByWorker({
				row: candidate({
					ownerInternalEntityId: "ent_internal_unnamed",
					ownerEntityId: null,
				}),
			}),
		).toBe(false);
	});
});
