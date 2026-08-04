import { describe, expect, it, mock } from "bun:test";
import type { FullSubject } from "@autumn/shared";
import type { SubjectReadFrom } from "@/db/resolveSubjectReadDb.js";

// Captures what readFrom each wrapper hands the cache action — the whole
// replica-grant contract lives in that one argument.
const captured: { readFrom?: SubjectReadFrom }[] = [];
const fakeSubject = { customer: { id: "cus_grant" } } as unknown as FullSubject;

mock.module(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	() => ({
		getOrSetCachedFullSubject: async (args: { readFrom?: SubjectReadFrom }) => {
			captured.push({ readFrom: args.readFrom });
			return fakeSubject;
		},
	}),
);

const { getApiCustomerByRollout } = await import(
	"@/internal/customers/actions/getApiCustomerByRollout.js"
);

const makeCtx = () =>
	({
		org: { id: "org_grant_test" },
		env: "sandbox",
		skipCache: false,
		logger: { info() {}, warn() {}, error() {}, debug() {} },
	}) as never;

const lastReadFrom = (): SubjectReadFrom | undefined =>
	captured.at(-1)?.readFrom;

describe("wrapper replica grant", () => {
	it("grants replica-ok by default on the read wrapper", async () => {
		await getApiCustomerByRollout({
			ctx: makeCtx(),
			customerId: "cus_grant",
		}).catch(() => {});

		expect(lastReadFrom()).toBe("replica-ok");
	});

	it("disableReplicaRead pins the read to the primary", async () => {
		await getApiCustomerByRollout({
			ctx: makeCtx(),
			customerId: "cus_grant",
			disableReplicaRead: true,
		}).catch(() => {});

		expect(lastReadFrom()).toBe("primary");
	});
});
