/** The repopulate-on-read commit point: a fresh attach never writes its
 *  included allowance into the balance cache, it invalidates and lets the next
 *  read refill from Postgres. That refill is where the metering shadow gets to
 *  see the seed balance at all, so it needs its own mirror. */

import { afterEach, describe, expect, test } from "bun:test";
import {
	AppEnv,
	type NormalizedFullSubject,
	SubjectType,
} from "@autumn/shared";
import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ShadowTapParams } from "@/internal/metering/shadow/shadowEvent.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const recorded: (ShadowTapParams & { type: string })[] = [];

await mockModuleWithRestore("@/internal/metering/shadow/shadowTap.js", () => ({
	shadowTapSet: (params: ShadowTapParams) => {
		recorded.push({ ...params, type: "set" });
	},
}));

const { setCachedFullSubject } = await import(
	// @ts-expect-error - Bun cache-busting query isolates module mocks.
	"@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setCachedFullSubject.js?fillTap"
);

type BalanceOverrides = {
	id: string;
	featureId: string;
	balance: number;
	unlimited?: boolean;
};

const makeBalance = ({
	id,
	featureId,
	balance,
	unlimited = false,
}: BalanceOverrides) =>
	({
		id,
		feature_id: featureId,
		internal_feature_id: `if_${featureId}`,
		customer_product_id: "cp_1",
		entitlement_id: `ent_${id}`,
		internal_customer_id: "icus_1",
		internal_entity_id: null,
		unlimited,
		balance,
		adjustment: 0,
		additional_balance: 0,
		usage_allowed: false,
		separate_interval: false,
		reset_cycle_anchor: null,
		next_reset_at: null,
		expires_at: null,
		external_id: null,
		entities: null,
		cache_version: 0,
		created_at: 0,
		entitlement: {
			id: `ent_${id}`,
			allowance_type: unlimited ? "unlimited" : "fixed",
			entity_feature_id: null,
			interval: "month",
			feature: { id: featureId, internal_id: `if_${featureId}` },
		},
		replaceables: [],
		rollovers: [],
		customerPrice: null,
		customerProductOptions: null,
		customerProductQuantity: 1,
		isEntityLevel: false,
	}) as unknown as NormalizedFullSubject["customer_entitlements"][number];

const makeNormalized = ({
	balances,
}: {
	balances: BalanceOverrides[];
}): NormalizedFullSubject =>
	({
		subjectType: SubjectType.Customer,
		customerId: "cus_public_1",
		internalCustomerId: "icus_1",
		entityId: undefined,
		internalEntityId: undefined,
		customer: { id: "cus_public_1", internal_id: "icus_1" },
		entity: undefined,
		products: [],
		customer_products: [],
		customer_prices: [],
		customer_licenses: [],
		flags: {},
		customer_entitlements: balances.map(makeBalance),
		entity_aggregations: undefined,
		usage_windows: [],
		subscriptions: [],
		invoices: [],
	}) as unknown as NormalizedFullSubject;

const createCtx = ({
	luaResult,
	status = "ready",
}: {
	luaResult: string | null;
	status?: string;
}): AutumnContext => {
	const redisV2 = {
		status,
		setCachedFullSubject: async () => luaResult,
	} as unknown as Redis;

	return {
		org: { id: "org_1" },
		env: AppEnv.Sandbox,
		redisV2,
		logger: { info: () => {}, warn: () => {}, error: () => {} },
	} as unknown as AutumnContext;
};

const fill = async ({
	luaResult,
	balances,
	status,
}: {
	luaResult: string | null;
	balances: BalanceOverrides[];
	status?: string;
}) =>
	await setCachedFullSubject({
		ctx: createCtx({ luaResult, status }),
		normalized: makeNormalized({ balances }),
		fetchedSubjectViewEpoch: 1,
	});

afterEach(() => {
	recorded.length = 0;
});

describe("setCachedFullSubject metering mirror", () => {
	test("a fill installs one set per feature under the public customer id", async () => {
		await fill({
			luaResult: "OK",
			balances: [
				{ id: "ce_1", featureId: "messages", balance: 1000 },
				{ id: "ce_2", featureId: "credits", balance: 250 },
			],
		});

		expect(recorded).toHaveLength(2);
		const byFeature = new Map(
			recorded.map((event) => [event.featureId, event]),
		);

		expect(byFeature.get("messages")).toMatchObject({
			type: "set",
			orgId: "org_1",
			env: AppEnv.Sandbox,
			// The identifier the deduct tap sends as `body.customer_id`, and the one
			// the balance key is built from, so the fold joins the two.
			customerId: "cus_public_1",
			value: 1000,
		});
		expect(byFeature.get("credits")?.value).toBe(250);
	});

	test("a feature's cusEnts are summed into one meter", async () => {
		// The fold keys a meter by (customer, feature), so two grants on the same
		// feature have to seed as one number or the deducts will not line up.
		await fill({
			luaResult: "OK",
			balances: [
				{ id: "ce_1", featureId: "messages", balance: 700 },
				{ id: "ce_2", featureId: "messages", balance: 300 },
			],
		});

		expect(recorded).toHaveLength(1);
		expect(recorded[0]).toMatchObject({ featureId: "messages", value: 1000 });
	});

	test("the mutation id is the post-state, so a repeated fill dedupes", async () => {
		for (let attempt = 0; attempt < 2; attempt++) {
			await fill({
				luaResult: "OK",
				balances: [{ id: "ce_1", featureId: "messages", balance: 1000 }],
			});
		}

		expect(recorded).toHaveLength(2);
		expect(recorded[0].idempotencyKey).toBe(recorded[1].idempotencyKey);

		// A fill after usage installs a different post-state, so it is a new event
		// and the worker re-seeds rather than dropping the correction.
		await fill({
			luaResult: "OK",
			balances: [{ id: "ce_1", featureId: "messages", balance: 987 }],
		});
		expect(recorded[2].idempotencyKey).not.toBe(recorded[0].idempotencyKey);
	});

	test("an emptied feature seeds zero rather than going unmirrored", async () => {
		await fill({
			luaResult: "OK",
			balances: [{ id: "ce_1", featureId: "messages", balance: 0 }],
		});

		expect(recorded).toHaveLength(1);
		expect(recorded[0].value).toBe(0);
	});

	test("a write the Lua refused installs nothing, so nothing mirrors", async () => {
		for (const luaResult of ["CACHE_EXISTS", "STALE_WRITE", null]) {
			await fill({
				luaResult,
				balances: [{ id: "ce_1", featureId: "messages", balance: 1000 }],
			});
		}

		expect(recorded).toHaveLength(0);
	});

	test("an unlimited feature has no v1 representation and is skipped", async () => {
		await fill({
			luaResult: "OK",
			balances: [
				{ id: "ce_1", featureId: "messages", balance: 0, unlimited: true },
				{ id: "ce_2", featureId: "credits", balance: 250 },
			],
		});

		expect(recorded.map((event) => event.featureId)).toEqual(["credits"]);
	});

	test("an overdrawn feature seeds the zero the API reports, not a negative", async () => {
		// The API clamps `remaining` at zero for an overdrawn balance, and the seed
		// comes from that same helper. Skipping instead would leave the worker with
		// no meter at all, which the diff would read as a false worker_missing.
		await fill({
			luaResult: "OK",
			balances: [
				{ id: "ce_1", featureId: "messages", balance: -50 },
				{ id: "ce_2", featureId: "credits", balance: 250 },
			],
		});

		expect(recorded.map((event) => event.featureId)).toEqual([
			"messages",
			"credits",
		]);
		expect(recorded[0].value).toBe(0);
	});
});
