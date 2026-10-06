import { beforeEach, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	_resetOrgLookupsForTesting,
	getOrgWithFeaturesCached,
	ORG_LOOKUP_REUSE_MS,
} from "../../../src/orgs/getOrgWithFeaturesCached.js";

const ctx = {} as never;
let lookups = 0;
const lookUp = async () => {
	lookups++;
	await Bun.sleep(2);
	return { org: { id: "org_1" }, features: [] } as never;
};

beforeEach(() => {
	lookups = 0;
	_resetOrgLookupsForTesting();
});

test("a burst of lookups for one org reads the store once", async () => {
	const results = await Promise.all(
		Array.from({ length: 64 }, () =>
			getOrgWithFeaturesCached({
				ctx,
				orgId: "org_1",
				env: AppEnv.Live,
				lookUp,
			}),
		),
	);
	expect(lookups).toBe(1);
	expect(results).toHaveLength(64);
});

test("the org is looked up again once the reuse window has passed", async () => {
	let clock = 1_000;
	const now = () => clock;
	const look = () =>
		getOrgWithFeaturesCached({
			ctx,
			orgId: "org_1",
			env: AppEnv.Live,
			now,
			lookUp,
		});
	await look();
	clock += ORG_LOOKUP_REUSE_MS - 1;
	await look();
	expect(lookups).toBe(1);
	clock += 1;
	await look();
	expect(lookups).toBe(2);
});

test("each env of an org is its own lookup, and a failed lookup is not reused", async () => {
	await getOrgWithFeaturesCached({
		ctx,
		orgId: "org_1",
		env: AppEnv.Live,
		lookUp,
	});
	await getOrgWithFeaturesCached({
		ctx,
		orgId: "org_1",
		env: AppEnv.Sandbox,
		lookUp,
	});
	expect(lookups).toBe(2);
	const failing = async () => {
		lookups++;
		throw new Error("store down");
	};
	_resetOrgLookupsForTesting();
	await expect(
		getOrgWithFeaturesCached({
			ctx,
			orgId: "org_2",
			env: AppEnv.Live,
			lookUp: failing,
		}),
	).rejects.toThrow("store down");
	await Bun.sleep(1);
	await getOrgWithFeaturesCached({
		ctx,
		orgId: "org_2",
		env: AppEnv.Live,
		lookUp,
	});
	expect(lookups).toBe(4);
});
