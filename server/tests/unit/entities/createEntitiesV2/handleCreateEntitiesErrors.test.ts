import { describe, expect, test } from "bun:test";
import type {
	FullCusEntWithFullCusProduct,
	FullCustomer,
	Replaceable,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { entities } from "@tests/utils/fixtures/db/entities.js";
import { features } from "@tests/utils/fixtures/db/features.js";
import { handleCreateEntitiesErrors } from "@/internal/entities/actions/createEntitiesV2/errors/handleCreateEntitiesErrors.js";
import type { CreateEntitiesContext } from "@/internal/entities/actions/createEntitiesV2/types/createEntitiesContext.js";

const SEAT_LIMIT = 5;
const seats = features.create({ id: "seats", name: "Seats" });

const replaceable = (id: string): Replaceable => ({
	id,
	cus_ent_id: "cus_ent_seats",
	created_at: 0,
	from_entity_id: null,
	delete_next_cycle: true,
});

/** Seats at the usage limit (balance -5), holding the given paid-for, unused seats. */
const contextAtSeatLimit = ({
	replaceableIds,
	newEntityIds,
}: {
	replaceableIds: string[];
	newEntityIds: string[];
}): CreateEntitiesContext => {
	const seatEntitlement = customerEntitlements.create({
		id: "cus_ent_seats",
		featureId: seats.id,
		featureName: seats.name,
		allowance: 0,
		balance: -SEAT_LIMIT,
	});
	const customerEntitlement: FullCusEntWithFullCusProduct = {
		...seatEntitlement,
		entitlement: { ...seatEntitlement.entitlement, usage_limit: SEAT_LIMIT },
		replaceables: replaceableIds.map(replaceable),
		customer_product: null,
	};
	const inserted = newEntityIds.map((id) =>
		entities.create({ id, featureId: seats.id }),
	);
	return {
		fullCustomer: {} as FullCustomer,
		customerEntitlements: [customerEntitlement],
		currentEpochMs: 0,
		requestedEntities: newEntityIds.map((id) => ({
			id,
			feature_id: seats.id,
		})),
		existingEntities: [],
		insertedEntities: inserted,
		entitiesByFeature: [{ feature: seats, inserted, claimed: [] }],
		defaultProducts: [],
		invoicedCustomerEntitlements: [],
	};
};

const params = {
	customerId: "cus_test",
	entities: [],
	allowPaidFeatures: true,
};

describe("handleCreateEntitiesErrors: usage limit", () => {
	test("a new seat that reuses a paid-for seat stays within the limit", () => {
		const context = contextAtSeatLimit({
			replaceableIds: ["rep_1"],
			newEntityIds: ["seat_6"],
		});
		expect(() => handleCreateEntitiesErrors({ context, params })).not.toThrow();
	});

	test("a new seat past the reusable ones is refused", () => {
		const context = contextAtSeatLimit({
			replaceableIds: ["rep_1"],
			newEntityIds: ["seat_6", "seat_7"],
		});
		expect(() => handleCreateEntitiesErrors({ context, params })).toThrow(
			"would exceed the usage limit",
		);
	});

	test("a new seat with nothing to reuse is refused", () => {
		const context = contextAtSeatLimit({
			replaceableIds: [],
			newEntityIds: ["seat_6"],
		});
		expect(() => handleCreateEntitiesErrors({ context, params })).toThrow(
			"would exceed the usage limit",
		);
	});
});
