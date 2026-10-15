import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import {
	atomExternalId,
	atomNames,
	atomStackName,
	atomStackNameSuffix,
	cacheGroupLabel,
	cacheOwner,
	legacyShadowAtomNames,
	nextAtomId,
	SHADOW_ATOM_OWNER,
} from "@/internal/byoc/utils/byocCacheUtils.js";

const org = { id: "org_1", slug: "acme" } as Organization;
const env = AppEnv.Sandbox;
const owner = cacheOwner({ org, env });

describe("cache deployment names", () => {
	const originalPrefix = process.env.ATOM_DEPLOYMENT_PREFIX;

	afterEach(() => {
		if (originalPrefix === undefined) delete process.env.ATOM_DEPLOYMENT_PREFIX;
		else process.env.ATOM_DEPLOYMENT_PREFIX = originalPrefix;
	});

	test("a dev stack puts its own name in front, so two stacks can hold the same org", () => {
		process.env.ATOM_DEPLOYMENT_PREFIX = "johnyeocx-wt5-john-atom";
		expect(atomExternalId({ owner })).toBe(
			"johnyeocx-wt5-john-atom.org_1.sandbox",
		);
		expect(cacheGroupLabel({ org, env })).toBe(
			"johnyeocx-wt5-john-atom-autumn-byoc-acme-sandbox",
		);
	});

	test("a blank prefix counts as none", () => {
		process.env.ATOM_DEPLOYMENT_PREFIX = "  ";
		expect(atomExternalId({ owner })).toBe("org_1.sandbox");
		expect(cacheGroupLabel({ org, env })).toBe("autumn-byoc-acme-sandbox");
	});

	test("without a prefix the org is named bare", () => {
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		expect(atomExternalId({ owner })).toBe("org_1.sandbox");
		expect(cacheGroupLabel({ org, env })).toBe("autumn-byoc-acme-sandbox");
	});

	test("a stack is named atom-<slug>-<env> or the chosen base, then a suffix from its external id", () => {
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		const suffix = atomStackNameSuffix({ owner });
		expect(suffix).toMatch(/^[0-9a-f]{6}$/);
		expect(atomStackName({ owner })).toBe(`atom-acme-sandbox-${suffix}`);
		expect(atomStackName({ owner, base: "acme-atom" })).toBe(
			`acme-atom-${suffix}`,
		);
		expect(atomNames({ owner, stackName: "acme-atom-abc123" })).toEqual({
			externalId: "org_1.sandbox",
			label: "acme-atom-abc123",
		});
	});

	test("an org's next Atom id is fixed by the Atoms it has, whatever their order", () => {
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		const atomId = nextAtomId({ owner, existingAtomIds: ["atom_b", "atom_a"] });
		expect(atomId).toMatch(/^atom_[0-9a-f]{24}$/);
		expect(atomExternalId({ owner, atomId })).toBe(`org_1.sandbox.${atomId}`);
		expect(nextAtomId({ owner, existingAtomIds: ["atom_a", "atom_b"] })).toBe(
			atomId,
		);
	});

	test("the suffix differs per env and per dev stack, and leaves the branch out of the name", () => {
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		const sandbox = atomStackNameSuffix({ owner });
		expect(
			atomStackNameSuffix({ owner: cacheOwner({ org, env: AppEnv.Live }) }),
		).not.toBe(sandbox);
		process.env.ATOM_DEPLOYMENT_PREFIX = "john-atom-setup-ui";
		expect(atomStackNameSuffix({ owner })).not.toBe(sandbox);
		expect(atomStackName({ owner })).not.toContain("john");
	});

	test("each new shadow Atom is named apart from every earlier one, the way an org's Atoms are", () => {
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		const legacyId = legacyShadowAtomNames().externalId;
		const first = nextAtomId({
			owner: SHADOW_ATOM_OWNER,
			existingAtomIds: [legacyId],
		});
		const second = nextAtomId({
			owner: SHADOW_ATOM_OWNER,
			existingAtomIds: [legacyId, first],
		});
		expect(second).not.toBe(first);
		const a = atomNames({ owner: SHADOW_ATOM_OWNER, atomId: first });
		const b = atomNames({ owner: SHADOW_ATOM_OWNER, atomId: second });
		expect(a.externalId).toBe(`autumn-internal-shadow-atom.${first}`);
		expect(a.label).toMatch(/^atom-shadow-[0-9a-f]{6}$/);
		expect(b.externalId).not.toBe(a.externalId);
		expect(b.label).not.toBe(a.label);
		expect([a.externalId, b.externalId]).not.toContain(legacyId);
	});

	test("an org named to look like our shadow Atom still gets its own deployment group", () => {
		for (const prefix of [undefined, "capy-admin-shadow-atom-tab"]) {
			if (prefix) process.env.ATOM_DEPLOYMENT_PREFIX = prefix;
			else delete process.env.ATOM_DEPLOYMENT_PREFIX;
			const shadowAtomId = nextAtomId({
				owner: SHADOW_ATOM_OWNER,
				existingAtomIds: [],
			});
			const shadows = [
				legacyShadowAtomNames(),
				atomNames({ owner: SHADOW_ATOM_OWNER, atomId: shadowAtomId }),
			];
			for (const lookalike of [
				"autumn-internal-shadow-atom",
				"shadow-atom",
				"autumn-shadow-atom",
			])
				for (const orgEnv of [AppEnv.Sandbox, AppEnv.Live]) {
					const lookalikeOwner = cacheOwner({
						org: { id: lookalike, slug: lookalike } as Organization,
						env: orgEnv,
					});
					for (const atomId of [undefined, shadowAtomId]) {
						const names = atomNames({ owner: lookalikeOwner, atomId });
						for (const shadow of shadows) {
							expect(names.externalId).not.toBe(shadow.externalId);
							expect(names.label).not.toBe(shadow.label);
						}
					}
				}
		}
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		expect(legacyShadowAtomNames()).toEqual({
			externalId: "autumn-internal-shadow-atom",
			label: "autumn-internal-shadow-atom",
		});
	});

	test("every external id we build is one alien accepts, with or without a dev prefix", () => {
		const alienExternalId = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;
		for (const prefix of [undefined, "capy-admin-shadow-atom-tab"]) {
			if (prefix) process.env.ATOM_DEPLOYMENT_PREFIX = prefix;
			else delete process.env.ATOM_DEPLOYMENT_PREFIX;
			expect(legacyShadowAtomNames().externalId).toMatch(alienExternalId);
			expect(
				atomExternalId({ owner: SHADOW_ATOM_OWNER, atomId: "atom_1" }),
			).toMatch(alienExternalId);
			expect(atomExternalId({ owner })).toMatch(alienExternalId);
		}
	});

	test("an external id alien would reject fails before it reaches alien", () => {
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
		expect(() =>
			atomExternalId({
				owner: cacheOwner({
					org: { id: "org:with:colons", slug: "x" } as Organization,
					env,
				}),
			}),
		).toThrow("not a valid alien external id");
	});
});
