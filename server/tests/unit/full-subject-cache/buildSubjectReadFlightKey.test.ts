import { beforeEach, describe, expect, test } from "bun:test";
import type { FullSubject } from "@autumn/shared";
import { buildSubjectReadFlightKey } from "@/internal/customers/cache/fullSubject/builders/buildSubjectReadFlightKey.js";
import {
	_resetSubjectReadInFlightForTesting,
	_subjectReadInFlightSizeForTesting,
	coalescedSubjectRead,
} from "@/internal/customers/cache/fullSubject/coalesceSubjectRead.js";

const base = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: "ent_1",
} as const;

const makeSubject = (id: string): FullSubject =>
	({ customer: { id } }) as unknown as FullSubject;

describe("buildSubjectReadFlightKey", () => {
	test("skipCache and readFrom are part of the key so modes cannot coalesce", () => {
		const cacheReplica = buildSubjectReadFlightKey({
			...base,
			skipCache: false,
			readFrom: "replica-ok",
		});
		const skipCacheReplica = buildSubjectReadFlightKey({
			...base,
			skipCache: true,
			readFrom: "replica-ok",
		});
		const cachePrimary = buildSubjectReadFlightKey({
			...base,
			skipCache: false,
			readFrom: "primary",
		});

		expect(cacheReplica).not.toBe(skipCacheReplica);
		expect(cacheReplica).not.toBe(cachePrimary);
		expect(skipCacheReplica).not.toBe(cachePrimary);
	});

	test("identical fetch modes share a key", () => {
		expect(
			buildSubjectReadFlightKey({
				...base,
				skipCache: false,
				readFrom: "replica-ok",
			}),
		).toBe(
			buildSubjectReadFlightKey({
				...base,
				skipCache: false,
				readFrom: "replica-ok",
			}),
		);
	});
});

describe("subject read flight key + coalescedSubjectRead", () => {
	beforeEach(() => {
		_resetSubjectReadInFlightForTesting();
	});

	test("skip_cache and cache-enabled reads do not share an in-flight fetch", async () => {
		let calls = 0;
		const fetch = () => {
			calls++;
			return Promise.resolve(makeSubject(`cus_${calls}`));
		};

		const cacheKey = buildSubjectReadFlightKey({
			...base,
			skipCache: false,
			readFrom: "replica-ok",
		});
		const skipKey = buildSubjectReadFlightKey({
			...base,
			skipCache: true,
			readFrom: "replica-ok",
		});

		const [cached, skipped] = await Promise.all([
			coalescedSubjectRead({ key: cacheKey, singleflight: true, fetch }),
			coalescedSubjectRead({ key: skipKey, singleflight: true, fetch }),
		]);

		expect(calls).toBe(2);
		expect(_subjectReadInFlightSizeForTesting()).toBe(0);
		expect(cached).not.toBe(skipped);
	});
});
