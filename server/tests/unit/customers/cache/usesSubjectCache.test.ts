import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as rolloutAccess from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { usesSubjectCache } from "@/internal/customers/cache/fullSubject/usesSubjectCache.js";
import { _setRolloutConfigForTesting } from "@/internal/misc/rollouts/rolloutConfigStore.js";
import { ACTIVE_ROLLOUT_ID } from "@/internal/misc/rollouts/rolloutUtils.js";

const ORG_ID = "org_cache";
const ctxWith = ({ skipCache = false } = {}) =>
	({ org: { id: ORG_ID }, skipCache }) as AutumnContext;
let overrideSpy: ReturnType<typeof spyOn> | undefined;

describe("usesSubjectCache", () => {
	beforeEach(() => {
		overrideSpy = spyOn(
			rolloutAccess,
			"getBalanceWorkerRolloutOverride",
		).mockImplementation(() => undefined);
	});
	afterEach(() => {
		overrideSpy?.mockRestore();
		_setRolloutConfigForTesting({ config: { rollouts: {} } });
	});

	test("skipCache wins over everything", () => {
		expect(
			usesSubjectCache({ ctx: ctxWith({ skipCache: true }), customerId: "cus" }),
		).toBe(false);
	});

	test("a customer not on the worker uses the cache", () => {
		expect(usesSubjectCache({ ctx: ctxWith(), customerId: "cus" })).toBe(true);
	});

	test("a customer on the worker never gets a Redis view", () => {
		_setRolloutConfigForTesting({
			config: {
				rollouts: {
					[ACTIVE_ROLLOUT_ID]: {
						percent: 100,
						previousPercent: 100,
						changedAt: 0,
						orgs: {},
					},
				},
			},
		});
		expect(usesSubjectCache({ ctx: ctxWith(), customerId: "cus" })).toBe(false);
	});

	test("no customer id means the cache is used (the worker is keyed by id)", () => {
		expect(usesSubjectCache({ ctx: ctxWith(), customerId: null })).toBe(true);
	});
});
