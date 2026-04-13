import { describe, expect, test } from "bun:test";
import {
	buildFullSubjectBalanceKey,
	buildFullSubjectGuardKey,
	buildFullSubjectKey,
	buildFullSubjectReserveKey,
} from "@/internal/customers/cache/fullSubject/index.js";

describe("fullSubject cache key builders", () => {
	test("builds customer-scoped keys", () => {
		expect(
			buildFullSubjectKey({
				orgId: "org",
				env: "test",
				customerId: "cus",
			}),
		).toBe("{cus}:org:test:full_subject");

		expect(
			buildFullSubjectBalanceKey({
				orgId: "org",
				env: "test",
				customerId: "cus",
				featureId: "feat",
			}),
		).toBe("{cus}:org:test:full_subject:balances:feat");

		expect(
			buildFullSubjectReserveKey({
				orgId: "org",
				env: "test",
				customerId: "cus",
			}),
		).toBe("{cus}:org:test:full_subject:reserve");

		expect(
			buildFullSubjectGuardKey({
				orgId: "org",
				env: "test",
				customerId: "cus",
			}),
		).toBe("{cus}:org:test:full_subject:guard");
	});

	test("builds entity-scoped keys", () => {
		expect(
			buildFullSubjectKey({
				orgId: "org",
				env: "test",
				customerId: "cus",
				entityId: "ent",
			}),
		).toBe("{cus}:org:test:entity:ent:full_subject");

		expect(
			buildFullSubjectBalanceKey({
				orgId: "org",
				env: "test",
				customerId: "cus",
				entityId: "ent",
				featureId: "feat",
			}),
		).toBe("{cus}:org:test:entity:ent:full_subject:balances:feat");

		expect(
			buildFullSubjectReserveKey({
				orgId: "org",
				env: "test",
				customerId: "cus",
				entityId: "ent",
			}),
		).toBe("{cus}:org:test:entity:ent:full_subject:reserve");

		expect(
			buildFullSubjectGuardKey({
				orgId: "org",
				env: "test",
				customerId: "cus",
				entityId: "ent",
			}),
		).toBe("{cus}:org:test:entity:ent:full_subject:guard");
	});
});
