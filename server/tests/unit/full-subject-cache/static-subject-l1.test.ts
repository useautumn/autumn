import { beforeEach, describe, expect, test } from "bun:test";
import type { CachedFullSubject } from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";
import {
	_cachedStaticSubjectL1SizeForTesting,
	_resetCachedStaticSubjectL1ForTesting,
	deleteCachedStaticSubject,
	getCachedStaticSubject,
	setCachedStaticSubject,
} from "@/internal/customers/cache/fullSubject/staticSubjectL1.js";

const buildCachedSubject = ({
	customerId,
	subjectViewEpoch,
}: {
	customerId: string;
	subjectViewEpoch: number;
}): CachedFullSubject =>
	({
		customerId,
		subjectViewEpoch,
	}) as CachedFullSubject;

describe("static FullSubject L1", () => {
	beforeEach(() => {
		_resetCachedStaticSubjectL1ForTesting();
	});

	test("stores parsed static subjects by exact Redis key and epoch", () => {
		const cached = buildCachedSubject({
			customerId: "customer_1",
			subjectViewEpoch: 7,
		});

		setCachedStaticSubject({
			subjectKey: "customer-subject",
			cached,
			serializedSize: 1_024,
		});

		expect(getCachedStaticSubject({ subjectKey: "customer-subject" })).toBe(
			cached,
		);
		expect(
			getCachedStaticSubject({ subjectKey: "entity-subject" }),
		).toBeUndefined();
		expect(_cachedStaticSubjectL1SizeForTesting()).toBe(1);
	});

	test("exact deletion prevents the static entry from being reused", () => {
		setCachedStaticSubject({
			subjectKey: "customer-subject",
			cached: buildCachedSubject({
				customerId: "customer_1",
				subjectViewEpoch: 7,
			}),
			serializedSize: 1_024,
		});

		deleteCachedStaticSubject({ subjectKey: "customer-subject" });

		expect(
			getCachedStaticSubject({ subjectKey: "customer-subject" }),
		).toBeUndefined();
	});

	test("does not retain subjects larger than the per-entry limit", () => {
		setCachedStaticSubject({
			subjectKey: "whale-subject",
			cached: buildCachedSubject({
				customerId: "customer_1",
				subjectViewEpoch: 7,
			}),
			serializedSize: 2 * 1024 * 1024 + 1,
		});

		expect(
			getCachedStaticSubject({ subjectKey: "whale-subject" }),
		).toBeUndefined();
		expect(_cachedStaticSubjectL1SizeForTesting()).toBe(0);
	});
});
