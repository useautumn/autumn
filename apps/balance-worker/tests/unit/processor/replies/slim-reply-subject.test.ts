/**
 * A reply's slimmed subject is reused while the state keeps its layout. Whatever the writes in between,
 * it must equal what slimSubjectForFeatures computes afresh on the same state and catalog.
 */

import { describe, expect, test } from "bun:test";
import {
	type Catalog,
	catalogRowsToCatalog,
	type SubjectState,
	slimSubjectForFeatures,
} from "@autumn/balance-engine";
import { slimReplySubject } from "../../../../src/processor/replies/slimReplySubject.js";
import { scenarios } from "../../../benchmarks/track-throughput/scenarios.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	testIdentity,
} from "../../../fixtures/mutations.js";

const seededRandom = (seed: number) => {
	let value = seed;
	return () => {
		value = (value + 0x6d2b79f5) | 0;
		let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
};

/** A balance-only write: one row replaced by a copy with a new balance, every other table kept. */
const moveBalance = ({
	state,
	index,
}: {
	state: SubjectState;
	index: number;
}): SubjectState => ({
	...state,
	revision: state.revision + 1,
	customerEntitlements: state.customerEntitlements.map((row, at) =>
		at === index ? { ...row, balance: row.balance - 1 } : row,
	),
});

/** A write that moves the layout: a product and its row added, so new tables and a new row id. */
const addPlan = ({
	state,
	n,
	featureId,
}: {
	state: SubjectState;
	n: number;
	featureId: string;
}): SubjectState => ({
	...state,
	revision: state.revision + 1,
	customerProducts: [
		...state.customerProducts,
		createCustomerProduct({ id: `cp_added_${n}` }),
	],
	customerEntitlements: [
		...state.customerEntitlements,
		createCustomerEntitlement({
			id: `row_added_${n}`,
			featureId,
			balance: 10,
		}),
	],
});

describe("slimReplySubject", () => {
	for (const seed of [1, 2, 3, 4, 5])
		test(`equals slimSubjectForFeatures on every state of a random run (seed ${seed})`, () => {
			const random = seededRandom(seed);
			const scenario = scenarios.heavy;
			if (!scenario) throw new Error("heavy scenario");
			const catalogs: Catalog[] = [
				catalogRowsToCatalog({ rows: scenario.catalogRows }),
				catalogRowsToCatalog({ rows: scenario.catalogRows }),
				catalogRowsToCatalog({ rows: scenario.catalogRows.slice(1) }),
			];
			let state = scenario.stateFor({
				identity: { ...testIdentity, customerId: `cus_${seed}` },
			});
			for (let n = 0; n < 400; n++) {
				const roll = random();
				const featureId =
					scenario.features[Math.floor(random() * scenario.features.length)] ??
					"";
				if (roll < 0.05) state = addPlan({ state, n, featureId });
				else
					state = moveBalance({
						state,
						index: Math.floor(random() * state.customerEntitlements.length),
					});
				const catalog =
					catalogs[random() < 0.9 ? 0 : Math.floor(random() * 3)] ??
					catalogs[0];
				if (!catalog) throw new Error("catalog");
				expect(slimReplySubject({ state, catalog, featureId })).toEqual(
					slimSubjectForFeatures({ state, catalog, featureIds: [featureId] }),
				);
			}
		});
});
