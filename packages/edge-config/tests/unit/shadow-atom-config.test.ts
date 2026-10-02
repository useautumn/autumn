import { describe, expect, test } from "bun:test";
import {
	inAtomRollout,
	SHADOW_ATOM_SETTLE_MS,
	type ShadowAtomConfig,
	ShadowAtomConfigSchema,
	type ShadowAtomEnvConfig,
	scheduleShadowAtomConfig,
	shadowAtomConfig,
} from "../../src/edgeConfig.js";

const customerIds = Array.from({ length: 10_000 }, (_, i) => `cus_${i}`);
const settled = 1_000_000;
const bucketOf = (customerId: string) =>
	Number(BigInt(Bun.hash(customerId)) % 100n);

const envAt = (
	rollout: Partial<ShadowAtomEnvConfig["rollout"]>,
): ShadowAtomEnvConfig =>
	ShadowAtomConfigSchema.parse({
		sandbox: { endpointUrl: "https://shadow.example.com", rollout },
	}).sandbox;

const atPercent = (percent: number) =>
	envAt({ percent, previousPercent: percent });

const shareIn = (config: ShadowAtomEnvConfig) =>
	customerIds.filter((customerId) =>
		inAtomRollout({ config, orgId: "org_1", customerId, now: settled }),
	).length / customerIds.length;

describe("shadowAtomConfig", () => {
	test("an empty file is off in both envs: no endpoint, no one in", () => {
		const config = shadowAtomConfig.defaultValue();
		expect(ShadowAtomConfigSchema.parse({})).toEqual(config);
		for (const env of ["sandbox", "live"] as const) {
			expect(config[env].endpointUrl).toBeNull();
			expect(config[env].adminEncryptedToken).toBeNull();
			expect(config[env].orgs).toEqual({});
			expect(shareIn(config[env])).toBe(0);
		}
	});

	test("a percent outside 0–100, or a fraction, is refused", () => {
		for (const percent of [150, -1, 12.5])
			expect(() => envAt({ percent })).toThrow();
	});
});

describe("inAtomRollout", () => {
	test("a customer is in when its bucket lands below the percent", () => {
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

	test("an org's own percent beats the env's, both ways", () => {
		expect(shareIn(envAt({ percent: 100, orgs: { org_1: 0 } }))).toBe(0);
		expect(shareIn(envAt({ percent: 0, orgs: { org_1: 100 } }))).toBe(1);
	});

	test("a pinned customer is in or out whatever the percent, and only in its own org", () => {
		const [pinnedIn, pinnedOut] = customerIds;
		const config = envAt({
			percent: 0,
			orgs: { org_2: 100 },
			customers: { org_1: { [pinnedIn]: true }, org_2: { [pinnedOut]: false } },
		});
		const isIn = (orgId: string, customerId: string) =>
			inAtomRollout({ config, orgId, customerId, now: settled });
		expect(isIn("org_1", pinnedIn)).toBe(true);
		expect(isIn("org_2", pinnedOut)).toBe(false);
		expect(isIn("org_3", pinnedIn)).toBe(false);
	});

	test("a percent change routes the previous percent until it settles", () => {
		const customerId = customerIds.find((id) => bucketOf(id) < 50) as string;
		const config = envAt({ percent: 0, previousPercent: 50, changedAt: 0 });
		const isInAt = (now: number) =>
			inAtomRollout({ config, orgId: "org_1", customerId, now });
		expect(isInAt(SHADOW_ATOM_SETTLE_MS - 1)).toBe(true);
		expect(isInAt(SHADOW_ATOM_SETTLE_MS)).toBe(false);
	});
});

describe("scheduleShadowAtomConfig", () => {
	const current: ShadowAtomConfig = ShadowAtomConfigSchema.parse({
		sandbox: { rollout: { percent: 20, previousPercent: 10, changedAt: 0 } },
	});
	const save = (sandboxRollout: Partial<ShadowAtomEnvConfig["rollout"]>) =>
		scheduleShadowAtomConfig({
			current,
			next: ShadowAtomConfigSchema.parse({
				sandbox: { rollout: sandboxRollout },
			}),
			now: settled,
		}).sandbox.rollout;

	test("a new percent starts from what routes now, whatever the caller sent", () => {
		expect(
			save({ percent: 50, previousPercent: 99, changedAt: 7 }),
		).toMatchObject({ percent: 50, previousPercent: 20, changedAt: settled });
	});

	test("the same percent keeps its settle bookkeeping", () => {
		expect(save({ percent: 20, orgs: { org_1: 5 } })).toMatchObject({
			percent: 20,
			previousPercent: 10,
			changedAt: 0,
			orgs: { org_1: 5 },
		});
	});
});

test("a save keeps each env's admin token and registered orgs, whatever the caller sent", () => {
	const registered = {
		org_1: { encryptedToken: "org_1_token", registeredAt: 1 },
	};
	const current = ShadowAtomConfigSchema.parse({
		sandbox: { adminEncryptedToken: "minted", orgs: registered },
	});
	const saved = scheduleShadowAtomConfig({
		current,
		next: ShadowAtomConfigSchema.parse({
			sandbox: {
				endpointUrl: "https://shadow.example.com",
				adminEncryptedToken: "forged",
				orgs: { org_2: { encryptedToken: "forged", registeredAt: 2 } },
			},
			live: { adminEncryptedToken: "forged" },
		}),
		now: settled,
	});
	expect(saved.sandbox.endpointUrl).toBe("https://shadow.example.com");
	expect(saved.sandbox.adminEncryptedToken).toBe("minted");
	expect(saved.sandbox.orgs).toEqual(registered);
	expect(saved.live.adminEncryptedToken).toBeNull();
	expect(saved.live.orgs).toEqual({});
});

test("a save keeps each env's deployment group, whatever the caller sent", () => {
	const current = ShadowAtomConfigSchema.parse({
		sandbox: { deploymentGroupId: "dg_sandbox" },
		live: { deploymentGroupId: "dg_live" },
	});
	const saved = scheduleShadowAtomConfig({
		current,
		next: ShadowAtomConfigSchema.parse({
			live: { deploymentGroupId: "dg_x" },
		}),
		now: 0,
	});

	expect(saved.sandbox.deploymentGroupId).toBe("dg_sandbox");
	expect(saved.live.deploymentGroupId).toBe("dg_live");
});
