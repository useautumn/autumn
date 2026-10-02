import { describe, expect, test } from "bun:test";
import {
	fullSubjectToCustomerEntitlements,
	markFullSubjectImmutable,
} from "@autumn/shared";
import { fullSubjectToHeldRows } from "../../../../../../packages/balance-engine/src/utils/subjectUtils/convertSubjectUtils.js";
import { createState, createSubjectFor } from "../../../fixtures/mutations.js";

describe("rows kept on an immutable view", () => {
	test("an unmarked view is flattened afresh on every selection", () => {
		const view = createSubjectFor({ state: createState(), entityId: null });
		const first = fullSubjectToHeldRows({ fullSubject: view });
		const second = fullSubjectToHeldRows({ fullSubject: view });
		expect(second).toEqual(first);
		expect(second).not.toBe(first);
	});

	test("a marked view flattens once and every selection over it shares the rows", () => {
		const view = markFullSubjectImmutable({
			fullSubject: createSubjectFor({ state: createState(), entityId: null }),
		});
		expect(fullSubjectToHeldRows({ fullSubject: view })).toBe(
			fullSubjectToHeldRows({ fullSubject: view }),
		);
		const [first] = fullSubjectToCustomerEntitlements({
			fullSubject: view,
			featureIds: ["messages"],
			now: 1_700_000_000_000,
		});
		const [again] = fullSubjectToCustomerEntitlements({
			fullSubject: view,
			fundsFeatureId: "messages",
			now: 1_700_000_000_000,
		});
		expect(first).toBeDefined();
		expect(again).toBe(first);
	});

	test("a copy of a marked view carries no mark, so it is flattened on its own", () => {
		const view = markFullSubjectImmutable({
			fullSubject: createSubjectFor({ state: createState(), entityId: null }),
		});
		const copy = { ...view, entity: null };
		const held = fullSubjectToHeldRows({ fullSubject: copy });
		expect(held).not.toBe(fullSubjectToHeldRows({ fullSubject: view }));
		expect(fullSubjectToHeldRows({ fullSubject: copy })).not.toBe(held);
	});
});
