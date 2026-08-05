import { describe, expect, mock, test } from "bun:test";
import type { NormalizedFullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setCachedFullSubject.js";
import {
	assertPrimarySourced,
	isReplicaSourced,
	markReplicaSourced,
} from "@/internal/customers/cache/fullSubject/subjectProvenance.js";

describe("subjectProvenance", () => {
	test("unmarked object passes assertPrimarySourced", () => {
		const subject = { customerId: "cus_1" };

		expect<object>(assertPrimarySourced(subject, "testContext")).toBe(subject);
	});

	test("marked object throws with the context string in the message", () => {
		const subject = markReplicaSourced({ customerId: "cus_1" });

		expect(() => assertPrimarySourced(subject, "myWriterSite")).toThrow(
			/myWriterSite.*replica-sourced/,
		);
	});

	test("isReplicaSourced is true for marked, false for unmarked", () => {
		const marked = markReplicaSourced({ customerId: "cus_marked" });
		const unmarked = { customerId: "cus_unmarked" };

		expect(isReplicaSourced(marked)).toBe(true);
		expect(isReplicaSourced(unmarked)).toBe(false);
	});

	test("structuredClone of a marked object escapes the mark (intentional)", () => {
		// Accepted hole: WeakSet identity doesn't survive clone. Clones only
		// occur downstream of the writers; the type brand covers compile time.
		const marked = markReplicaSourced({ customerId: "cus_clone" });
		const clone = structuredClone(marked);

		expect(isReplicaSourced(clone)).toBe(false);
		expect<object>(assertPrimarySourced(clone, "cloneContext")).toBe(clone);
	});

	test("setCachedFullSubject throws on a marked subject before any Redis work", async () => {
		const redisSpy = mock(() => Promise.resolve("OK"));
		const loggerInfo = mock(() => {});
		const ctx = {
			logger: { info: loggerInfo },
			org: { id: "org_1" },
			env: "live",
			redisV2: { setCachedFullSubject: redisSpy },
		} as unknown as AutumnContext;

		const normalized = markReplicaSourced({
			customerId: "cus_poisoned",
			entityId: null,
		}) as unknown as NormalizedFullSubject;

		await expect(
			setCachedFullSubject({
				ctx,
				normalized,
				fetchedSubjectViewEpoch: 1,
			}),
		).rejects.toThrow(/setCachedFullSubject.*replica-sourced/);

		expect(redisSpy).not.toHaveBeenCalled();
		expect(loggerInfo).not.toHaveBeenCalled();
	});
});
