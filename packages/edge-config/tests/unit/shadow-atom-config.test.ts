import { describe, expect, test } from "bun:test";
import {
	applyShadowAtomSettings,
	inAtomRollout,
	SHADOW_ATOM_SETTLE_MS,
	ShadowAtomConfigSchema,
	type ShadowAtomEnvConfig,
	type ShadowAtomOrg,
	scheduleOrgPercent,
	shadowAtomConfig,
} from "../../src/edgeConfig.js";

const customerIds = Array.from({ length: 10_000 }, (_, i) => `cus_${i}`);
const settled = 1_000_000;
const bucketOf = (customerId: string) =>
	Number(BigInt(Bun.hash(customerId)) % 100n);

const registered = (org: Partial<ShadowAtomOrg>): ShadowAtomOrg => ({
	encryptedToken: "org_token",
	registeredAt: 1,
	percent: 100,
	previousPercent: 0,
	changedAt: 0,
	...org,
});

const envWith = (orgs: Record<string, Partial<ShadowAtomOrg>>) =>
	ShadowAtomConfigSchema.parse({
		sandbox: {
			endpointUrl: "https://shadow.example.com",
			orgs: Object.fromEntries(
				Object.entries(orgs).map(([orgId, org]) => [orgId, registered(org)]),
			),
		},
	}).sandbox;

const atPercent = (percent: number) =>
	envWith({ org_1: { percent, previousPercent: percent } });

const shareIn = (config: ShadowAtomEnvConfig, orgId = "org_1") =>
	customerIds.filter((customerId) =>
		inAtomRollout({ config, orgId, customerId, now: settled }),
	).length / customerIds.length;

describe("shadowAtomConfig", () => {
	test("an empty file is off in both envs: no endpoint, no org, no one in", () => {
		const config = shadowAtomConfig.defaultValue();
		expect(ShadowAtomConfigSchema.parse({})).toEqual(config);
		for (const env of ["sandbox", "live"] as const) {
			expect(config[env].endpointUrl).toBeNull();
			expect(config[env].adminEncryptedToken).toBeNull();
			expect(config[env].orgs).toEqual({});
			expect(shareIn(config[env])).toBe(0);
		}
	});

	test("an org's percent outside 0–100, or a fraction, is refused", () => {
		for (const percent of [150, -1, 12.5])
			expect(() => envWith({ org_1: { percent } })).toThrow();
	});
});

describe("inAtomRollout", () => {
	test("an org that is not registered has no one in", () => {
		expect(shareIn(atPercent(100), "org_2")).toBe(0);
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

test("a save sets only each env's address; admin token and orgs stay, whatever the caller sent", () => {
	const orgs = { org_1: registered({}) };
	const current = ShadowAtomConfigSchema.parse({
		sandbox: { adminEncryptedToken: "minted", orgs },
	});
	const saved = applyShadowAtomSettings({
		current,
		next: ShadowAtomConfigSchema.parse({
			sandbox: {
				endpointUrl: "https://shadow.example.com",
				adminEncryptedToken: "forged",
				orgs: { org_2: registered({ encryptedToken: "forged" }) },
			},
			live: { adminEncryptedToken: "forged" },
		}),
	});
	expect(saved.sandbox.endpointUrl).toBe("https://shadow.example.com");
	expect(saved.sandbox.adminEncryptedToken).toBe("minted");
	expect(saved.sandbox.orgs).toEqual(orgs);
	expect(saved.live.adminEncryptedToken).toBeNull();
	expect(saved.live.orgs).toEqual({});
});

test("a save keeps each env's deployment group, whatever the caller sent", () => {
	const current = ShadowAtomConfigSchema.parse({
		sandbox: { deploymentGroupId: "dg_sandbox" },
		live: { deploymentGroupId: "dg_live" },
	});
	const saved = applyShadowAtomSettings({
		current,
		next: ShadowAtomConfigSchema.parse({
			live: { deploymentGroupId: "dg_x" },
		}),
	});

	expect(saved.sandbox.deploymentGroupId).toBe("dg_sandbox");
	expect(saved.live.deploymentGroupId).toBe("dg_live");
});
