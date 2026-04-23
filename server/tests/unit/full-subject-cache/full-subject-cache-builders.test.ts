import { describe, expect, test } from "bun:test";
import {
	buildFullSubjectBalanceKey,
	buildFullSubjectKey,
	buildFullSubjectViewEpochKey,
	buildSharedFullSubjectBalanceKey,
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
			buildFullSubjectViewEpochKey({
				orgId: "org",
				env: "test",
				customerId: "cus",
			}),
		).toBe("{cus}:org:test:full_subject:view_epoch");

		expect(
			buildSharedFullSubjectBalanceKey({
				orgId: "org",
				env: "test",
				customerId: "cus",
				featureId: "feat",
			}),
		).toBe("{cus}:org:test:full_subject:shared_balances:feat");
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
	});
});
