/** A cycle reset clears prior attribution in the same typed intent as the
 * balance refill. */

import { describe, expect, test } from "bun:test";
import type { FullCustomerEntitlement } from "@autumn/shared";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils.js";

const makeCustomerEntitlement = ({
	entityFeatureId,
}: {
	entityFeatureId?: string;
}) =>
	({
		balance: 40,
		additional_balance: 0,
		adjustment: 0,
		entities: entityFeatureId
			? {
					entity_1: {
						balance: 40,
						adjustment: 0,
					},
				}
			: {},
		usage_attribution: {
			feature_a_internal: {
				units: 60,
				credits: 60,
			},
		},
		entitlement: {
			allowance: 100,
			entity_feature_id: entityFeatureId ?? null,
		},
	}) as unknown as FullCustomerEntitlement;

describe("getResetBalancesUpdate", () => {
	test.concurrent("clears attribution on a top-level balance reset", () => {
		const update = getResetBalancesUpdate({
			cusEnt: makeCustomerEntitlement({}),
		});

		expect(update).toMatchObject({
			balance: 100,
			additional_balance: 0,
			adjustment: 0,
			usage_attribution: {},
		});
	});

	test.concurrent("clears attribution on an entity balance reset", () => {
		const update = getResetBalancesUpdate({
			cusEnt: makeCustomerEntitlement({ entityFeatureId: "workspace" }),
		});

		expect(update).toMatchObject({
			usage_attribution: {},
			entities: {
				entity_1: {
					balance: 100,
					adjustment: 0,
				},
			},
		});
	});
});
