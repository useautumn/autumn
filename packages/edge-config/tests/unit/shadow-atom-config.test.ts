import { describe, expect, test } from "bun:test";
import {
	applyShadowAtomSettings,
	inAtomRollout,
	SHADOW_ATOM_SETTLE_MS,
	type ShadowAtomConfig,
	ShadowAtomConfigSchema,
	type ShadowAtomOrg,
	scheduleOrgPercent,
	shadowAtomConfig,
} from "../../src/edgeConfig.js";

const customerIds = Array.from({ length: 10_000 }, (_, i) => `cus_${i}`);
const settled = 1_000_000;
const bucketOf = (customerId: string) =>
	Number(BigInt(Bun.hash(customerId)) % 100n);

const registered = (org: Partial<ShadowAtomOrg>): ShadowAtomOrg => ({
	encryptedTokens: { sandbox: "sandbox_token", live: "live_token" },
	registeredAt: 1,
	percent: 100,
	previousPercent: 0,
	changedAt: 0,
	...org,
});

const envWith = (orgs: Record<string, Partial<ShadowAtomOrg>>) =>
	ShadowAtomConfigSchema.parse({
		endpointUrl: "https://shadow.example.com",
		orgs: Object.fromEntries(
			Object.entries(orgs).map(([orgId, org]) => [orgId, registered(org)]),
		),
	});

const atPercent = (percent: number) =>
	envWith({ org_1: { percent, previousPercent: percent } });

const shareIn = (config: ShadowAtomConfig, orgId = "org_1") =>
	customerIds.filter((customerId) =>
		inAtomRollout({ config, orgId, customerId, now: settled }),
	).length / customerIds.length;

describe("shadowAtomConfig", () => {
	test("an empty file is off: no endpoint, no org, no one in", () => {
		const config = shadowAtomConfig.defaultValue();
		expect(ShadowAtomConfigSchema.parse({})).toEqual(config);
		expect(config.endpointUrl).toBeNull();
		expect(config.adminEncryptedToken).toBeNull();
		expect(config.orgs).toEqual({});
		expect(shareIn(config)).toBe(0);
	});

	test("there are no per-env keys: one config serves both envs", () => {
		expect(Object.keys(shadowAtomConfig.defaultValue()).sort()).toEqual([
			"adminEncryptedToken",
			"deployment",
			"deploymentGroupId",
			"endpointUrl",
			"orgs",
			"pushTransport",
		]);
	});

	test("an org's percent outside 0–100, or a fraction, is refused", () => {
		for (const percent of [150, -1, 12.5])
			expect(() => envWith({ org_1: { percent } })).toThrow();
	});
});

describe("inAtomRollout", () => {
	test("an org that is not registered has no one in, and an inherited key is no org", () => {
		expect(shareIn(atPercent(100), "org_2")).toBe(0);
		expect(shareIn(atPercent(100), "constructor")).toBe(0);
	});

	test("a registered org's customer is in when its bucket lands below the org's percent", () => {
		for (const customerId of customerIds.slice(0, 100))
			expect(
				inAtomRollout({
					config: atPercent(37),
					orgId: "org_1",
					customerId,
					now: settled,
				}),
			).toBe(bucketOf(customerId) < 37);
	});

	test("0 takes no one, 100 everyone, a percent about that share of 10k ids", () => {
		expect(shareIn(atPercent(0))).toBe(0);
		expect(shareIn(atPercent(100))).toBe(1);
		for (const percent of [10, 50, 90])
			expect(
				Math.abs(shareIn(atPercent(percent)) - percent / 100),
			).toBeLessThan(0.02);
	});

	test("each org follows its own percent", () => {
		const config = envWith({
			org_1: { percent: 0, previousPercent: 0 },
			org_2: { percent: 100, previousPercent: 100 },
		});
		expect(shareIn(config, "org_1")).toBe(0);
		expect(shareIn(config, "org_2")).toBe(1);
	});

	test("a percent change routes the previous percent until it settles", () => {
		const customerId = customerIds.find((id) => bucketOf(id) < 50) as string;
		const config = envWith({
			org_1: { percent: 0, previousPercent: 50, changedAt: 0 },
		});
		const isInAt = (now: number) =>
			inAtomRollout({ config, orgId: "org_1", customerId, now });
		expect(isInAt(SHADOW_ATOM_SETTLE_MS - 1)).toBe(true);
		expect(isInAt(SHADOW_ATOM_SETTLE_MS)).toBe(false);
	});
});

describe("scheduleOrgPercent", () => {
	const current = registered({
		percent: 20,
		previousPercent: 10,
		changedAt: 0,
	});

	test("a new percent starts from what routes now", () => {
		expect(scheduleOrgPercent({ current, percent: 50, now: settled })).toEqual({
			percent: 50,
			previousPercent: 20,
			changedAt: settled,
		});
	});

	test("the same percent keeps its settle bookkeeping", () => {
		expect(scheduleOrgPercent({ current, percent: 20, now: settled })).toEqual({
			percent: 20,
			previousPercent: 10,
			changedAt: 0,
		});
	});

	test("a newly registered org starts from no one", () => {
		expect(
			scheduleOrgPercent({ current: undefined, percent: 100, now: settled }),
		).toEqual({ percent: 100, previousPercent: 0, changedAt: settled });
	});
});

test("a save sets only the address; admin token and orgs stay, whatever the caller sent", () => {
	const orgs = { org_1: registered({}) };
	const current = ShadowAtomConfigSchema.parse({
		adminEncryptedToken: "minted",
		orgs,
	});
	const saved = applyShadowAtomSettings({
		current,
		next: ShadowAtomConfigSchema.parse({
			endpointUrl: "https://shadow.example.com",
			adminEncryptedToken: "forged",
			orgs: { org_2: registered({}) },
		}),
	});
	expect(saved.endpointUrl).toBe("https://shadow.example.com");
	expect(saved.adminEncryptedToken).toBe("minted");
	expect(saved.orgs).toEqual(orgs);
});

test("a save keeps the deployment group, whatever the caller sent", () => {
	const current = ShadowAtomConfigSchema.parse({ deploymentGroupId: "dg_1" });
	const saved = applyShadowAtomSettings({
		current,
		next: ShadowAtomConfigSchema.parse({ deploymentGroupId: "dg_x" }),
	});

	expect(saved.deploymentGroupId).toBe("dg_1");
});
