import { expect, test } from "bun:test";
import {
	createSubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import type { FullSubject } from "@autumn/shared";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	occurredAt,
} from "../../../../balance-engine/tests/unit/engineFixtures.js";
import { subjectToAutoTopupObjects } from "../../../src/trigger/subjectToAutoTopupObjects.js";
import type { AutoTopupSubject } from "../../../src/trigger/types/autoTopupSubject.js";

export const serverSubjectIsTriggerSubject = (
	fullSubject: FullSubject,
): AutoTopupSubject => fullSubject;

test("a worker subject with no charge source resolves its plan config and yields nothing", () => {
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [createCustomerEntitlement({ balance: 0 })],
	});
	const fullSubject = subjectStateToFullSubject({
		state,
		catalog: createCatalogFor({ state }),
	});

	expect(
		subjectToAutoTopupObjects({
			fullSubject,
			featureId: "messages",
			now: occurredAt,
		}),
	).toBeNull();
});
