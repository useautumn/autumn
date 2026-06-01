import { describe, expect, test } from "bun:test";
import {
	type AnchorCandidate,
	pickAnchorCustomerEntitlementId,
} from "@autumn/shared";

const candidate = (overrides: Partial<AnchorCandidate>): AnchorCandidate => ({
	id: "ce_1",
	is_entity_scoped: false,
	is_add_on: false,
	status_rank: 0,
	created_at: 1000,
	...overrides,
});

describe("pickAnchorCustomerEntitlementId", () => {
	test("returns null when there are no candidates", () => {
		expect(
			pickAnchorCustomerEntitlementId({
				candidates: [],
				scopeType: "customer",
			}),
		).toBeNull();
	});

	test("customer scope excludes entity-scoped candidates", () => {
		const id = pickAnchorCustomerEntitlementId({
			candidates: [
				candidate({ id: "ce_entity", is_entity_scoped: true }),
				candidate({ id: "ce_customer", is_entity_scoped: false }),
			],
			scopeType: "customer",
		});

		expect(id).toBe("ce_customer");
	});

	test("customer scope returns null when only entity-scoped candidates exist (fail closed)", () => {
		const id = pickAnchorCustomerEntitlementId({
			candidates: [candidate({ id: "ce_entity", is_entity_scoped: true })],
			scopeType: "customer",
		});

		expect(id).toBeNull();
	});

	test("entity scope falls back to customer-level candidates when none are entity-scoped", () => {
		const id = pickAnchorCustomerEntitlementId({
			candidates: [
				candidate({ id: "ce_a", is_entity_scoped: false }),
				candidate({ id: "ce_b", is_entity_scoped: false, created_at: 2000 }),
			],
			scopeType: "entity",
		});

		expect(id).toBe("ce_a");
	});

	test("entity scope prefers an entity-scoped candidate over a customer-level one", () => {
		const id = pickAnchorCustomerEntitlementId({
			candidates: [
				candidate({ id: "ce_customer", is_entity_scoped: false }),
				candidate({ id: "ce_entity", is_entity_scoped: true }),
			],
			scopeType: "entity",
		});

		expect(id).toBe("ce_entity");
	});

	test("prefers lower status_rank, then non-add-on, then oldest, then id", () => {
		// All customer-scope candidates; tie-break ladder.
		expect(
			pickAnchorCustomerEntitlementId({
				candidates: [
					candidate({ id: "ce_pastdue", status_rank: 1 }),
					candidate({ id: "ce_active", status_rank: 0 }),
				],
				scopeType: "customer",
			}),
		).toBe("ce_active");

		expect(
			pickAnchorCustomerEntitlementId({
				candidates: [
					candidate({ id: "ce_addon", is_add_on: true }),
					candidate({ id: "ce_base", is_add_on: false }),
				],
				scopeType: "customer",
			}),
		).toBe("ce_base");

		expect(
			pickAnchorCustomerEntitlementId({
				candidates: [
					candidate({ id: "ce_new", created_at: 2000 }),
					candidate({ id: "ce_old", created_at: 1000 }),
				],
				scopeType: "customer",
			}),
		).toBe("ce_old");

		expect(
			pickAnchorCustomerEntitlementId({
				candidates: [candidate({ id: "ce_b" }), candidate({ id: "ce_a" })],
				scopeType: "customer",
			}),
		).toBe("ce_a");
	});

	test("is deterministic regardless of input order", () => {
		const candidates = [
			candidate({ id: "ce_b", status_rank: 0, created_at: 1000 }),
			candidate({ id: "ce_a", status_rank: 0, created_at: 1000 }),
			candidate({ id: "ce_c", status_rank: 1, created_at: 500 }),
		];

		const forward = pickAnchorCustomerEntitlementId({
			candidates,
			scopeType: "customer",
		});
		const reversed = pickAnchorCustomerEntitlementId({
			candidates: [...candidates].reverse(),
			scopeType: "customer",
		});

		expect(forward).toBe("ce_a");
		expect(reversed).toBe("ce_a");
	});
});
