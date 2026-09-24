import { expect, test } from "bun:test";
import { measureSubjectState } from "../../../../src/processor/subject/actions/ensureSubject/measureSubjectState.js";
import {
	createCustomerEntitlement,
	createState,
} from "../../../fixtures/mutations.js";

test("a state is measured by serialised bytes and rows per table", () => {
	const state = createState({
		customerEntitlements: [
			createCustomerEntitlement({ externalId: "a", balance: 1 }),
			createCustomerEntitlement({ externalId: "b", balance: 2 }),
		],
	});
	const measure = measureSubjectState({ state });
	expect(measure.bytes).toBe(Buffer.byteLength(JSON.stringify(state), "utf8"));
	expect(measure.rows.customerEntitlements).toBe(2);
	expect(measure.rows.replaceables).toBe(state.replaceables.length);
	expect(measure.rows.rollovers).toBe(state.rollovers.length);
});
