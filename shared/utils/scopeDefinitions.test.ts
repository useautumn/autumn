import { describe, test, expect } from "bun:test";
import {
	Scopes,
	ROLE_SCOPES,
	RESOURCES,
	MODERN_SCOPES,
	LEGACY_SCOPES,
	OPENID_SCOPES,
	META_SCOPES,
	ALL_SCOPES,
	LEGACY_SCOPE_ALIASES,
	RESOURCE_METADATA,
	ACTION_METADATA,
	isOpenIdScope,
	isModernScope,
	isLegacyScope,
	isMetaScope,
	isValidScope,
	parseScope,
	expandScopes,
	checkScopes,
	isScopeSubset,
	makeScopeChecker,
	groupScopesByResource,
	formatActions,
	formatResourcePermission,
	groupAndFormatScopes,
	validateScopes,
	getResourceDescription,
	type Role,
	type ScopeString,
	type RouteScopeRequirement,
	type ResourceType,
	type ScopeActionType,
} from "./scopeDefinitions";

// ---------------------------------------------------------------------------
// 1. Constants & invariants
// ---------------------------------------------------------------------------

describe("constants & invariants", () => {
	test("RESOURCES has 10 entries in canonical order", () => {
		expect(RESOURCES.length).toBe(10);
		expect([...RESOURCES]).toEqual([
			"organisation",
			"customers",
			"features",
			"plans",
			"rewards",
			"balances",
			"billing",
			"analytics",
			"apiKeys",
			"platform",
		]);
	});

	test("MODERN_SCOPES count equals 2*len(resources) - 1 (analytics read-only)", () => {
		const expectedCount = RESOURCES.length * 2 - 1;
		expect(MODERN_SCOPES.length).toBe(expectedCount);
		expect(MODERN_SCOPES.length).toBe(19);
	});

	test("MODERN_SCOPES contains every Scopes.X.Read/Write entry", () => {
		const expected = [
			Scopes.Organisation.Read,
			Scopes.Organisation.Write,
			Scopes.Customers.Read,
			Scopes.Customers.Write,
			Scopes.Features.Read,
			Scopes.Features.Write,
			Scopes.Plans.Read,
			Scopes.Plans.Write,
			Scopes.Rewards.Read,
			Scopes.Rewards.Write,
			Scopes.Balances.Read,
			Scopes.Balances.Write,
			Scopes.Billing.Read,
			Scopes.Billing.Write,
			Scopes.Analytics.Read,
			Scopes.ApiKeys.Read,
			Scopes.ApiKeys.Write,
			Scopes.Platform.Read,
			Scopes.Platform.Write,
		];
		expect([...MODERN_SCOPES].sort()).toEqual([...expected].sort());
	});

	test("MODERN_SCOPES does NOT include analytics:write", () => {
		expect((MODERN_SCOPES as readonly string[]).includes("analytics:write")).toBe(false);
	});

	test("ALL_SCOPES contains OPENID_SCOPES + MODERN_SCOPES + META_SCOPES + LEGACY_SCOPES", () => {
		const expected = [
			...OPENID_SCOPES,
			...MODERN_SCOPES,
			...META_SCOPES,
			...LEGACY_SCOPES,
		];
		expect([...ALL_SCOPES].sort()).toEqual([...expected].sort());
		expect(ALL_SCOPES.length).toBe(
			OPENID_SCOPES.length +
				MODERN_SCOPES.length +
				META_SCOPES.length +
				LEGACY_SCOPES.length,
		);
	});

	test("LEGACY_SCOPES includes bare 'apiKeys' token", () => {
		expect((LEGACY_SCOPES as readonly string[]).includes("apiKeys")).toBe(true);
	});

	test("Scopes.Analytics has only Read (no Write property)", () => {
		expect(Scopes.Analytics.Read).toBe("analytics:read");
		expect((Scopes.Analytics as any).Write).toBeUndefined();
	});

	test("Scopes.Platform.Read === 'platform:read'", () => {
		expect(Scopes.Platform.Read).toBe("platform:read");
		expect(Scopes.Platform.Write).toBe("platform:write");
	});

	test("Meta-scope constants have expected values", () => {
		expect(Scopes.Admin).toBe("admin");
		expect(Scopes.Superuser).toBe("superuser");
		expect(Scopes.Owner).toBe("owner");
		expect(Scopes.Public).toBe("public");
	});

	test("META_SCOPES contains exactly the 4 meta-scopes", () => {
		expect([...META_SCOPES].sort()).toEqual(
			["admin", "owner", "public", "superuser"],
		);
	});

	test("OPENID_SCOPES contains exactly the 4 OIDC scopes", () => {
		expect([...OPENID_SCOPES].sort()).toEqual(
			["email", "offline_access", "openid", "profile"],
		);
	});

	test("RESOURCE_METADATA has an entry for every resource", () => {
		for (const r of RESOURCES) {
			expect(RESOURCE_METADATA[r]).toBeDefined();
			expect(typeof RESOURCE_METADATA[r].name).toBe("string");
			expect(typeof RESOURCE_METADATA[r].namePlural).toBe("string");
			expect(typeof RESOURCE_METADATA[r].description).toBe("string");
		}
	});

	test("ACTION_METADATA has read (order 1) and write (order 2)", () => {
		expect(ACTION_METADATA.read.order).toBe(1);
		expect(ACTION_METADATA.write.order).toBe(2);
		expect(ACTION_METADATA.read.verb).toBe("Read");
		expect(ACTION_METADATA.write.verb).toBe("Write");
	});

	test("LEGACY_SCOPE_ALIASES maps bare 'apiKeys' to apiKeys:write", () => {
		expect(LEGACY_SCOPE_ALIASES.apiKeys).toBe("apiKeys:write");
	});
});

// ---------------------------------------------------------------------------
// 2. Predicates
// ---------------------------------------------------------------------------

describe("isOpenIdScope", () => {
	test("returns true for every OPENID_SCOPES entry", () => {
		for (const s of OPENID_SCOPES) {
			expect(isOpenIdScope(s)).toBe(true);
		}
	});

	test("returns false for resource scopes", () => {
		expect(isOpenIdScope("customers:read")).toBe(false);
		expect(isOpenIdScope("plans:write")).toBe(false);
	});

	test("returns false for empty string and garbage", () => {
		expect(isOpenIdScope("")).toBe(false);
		expect(isOpenIdScope("garbage")).toBe(false);
		expect(isOpenIdScope("OPENID")).toBe(false);
	});

	test("returns false for meta scopes", () => {
		expect(isOpenIdScope("admin")).toBe(false);
		expect(isOpenIdScope("superuser")).toBe(false);
	});
});

describe("isModernScope", () => {
	test("returns true for every MODERN_SCOPES entry", () => {
		for (const s of MODERN_SCOPES) {
			expect(isModernScope(s)).toBe(true);
		}
	});

	test("returns false for every LEGACY_SCOPES entry", () => {
		for (const s of LEGACY_SCOPES) {
			expect(isModernScope(s)).toBe(false);
		}
	});

	test("returns false for every META_SCOPES entry", () => {
		for (const s of META_SCOPES) {
			expect(isModernScope(s)).toBe(false);
		}
	});

	test("returns false for every OPENID_SCOPES entry", () => {
		for (const s of OPENID_SCOPES) {
			expect(isModernScope(s)).toBe(false);
		}
	});

	test("returns false for analytics:write (intentionally absent)", () => {
		expect(isModernScope("analytics:write")).toBe(false);
	});

	test("returns false for garbage input", () => {
		expect(isModernScope("")).toBe(false);
		expect(isModernScope("garbage")).toBe(false);
		expect(isModernScope("customers")).toBe(false);
		expect(isModernScope("customers:")).toBe(false);
		expect(isModernScope(":read")).toBe(false);
	});
});

describe("isLegacyScope", () => {
	test("returns true for every LEGACY_SCOPES entry", () => {
		for (const s of LEGACY_SCOPES) {
			expect(isLegacyScope(s)).toBe(true);
		}
	});

	test("returns true for 'customers:create'", () => {
		expect(isLegacyScope("customers:create")).toBe(true);
	});

	test("returns false for modern scopes", () => {
		expect(isLegacyScope("customers:read")).toBe(false);
		expect(isLegacyScope("customers:write")).toBe(false);
	});

	test("returns false for meta, openid, and garbage", () => {
		expect(isLegacyScope("admin")).toBe(false);
		expect(isLegacyScope("openid")).toBe(false);
		expect(isLegacyScope("")).toBe(false);
		expect(isLegacyScope("garbage")).toBe(false);
	});
});

describe("isMetaScope", () => {
	test("returns true for every META_SCOPES entry", () => {
		for (const s of META_SCOPES) {
			expect(isMetaScope(s)).toBe(true);
		}
	});

	test("returns true for specific meta scopes", () => {
		expect(isMetaScope("admin")).toBe(true);
		expect(isMetaScope("owner")).toBe(true);
		expect(isMetaScope("superuser")).toBe(true);
		expect(isMetaScope("public")).toBe(true);
	});

	test("returns false for resource scopes", () => {
		expect(isMetaScope("customers:read")).toBe(false);
		expect(isMetaScope("plans:write")).toBe(false);
	});

	test("returns false for empty and garbage", () => {
		expect(isMetaScope("")).toBe(false);
		expect(isMetaScope("ADMIN")).toBe(false);
		expect(isMetaScope("garbage")).toBe(false);
	});
});

describe("isValidScope", () => {
	test("returns true for any ALL_SCOPES entry", () => {
		for (const s of ALL_SCOPES) {
			expect(isValidScope(s)).toBe(true);
		}
	});

	test("returns true across each category", () => {
		expect(isValidScope("openid")).toBe(true);
		expect(isValidScope("customers:read")).toBe(true);
		expect(isValidScope("admin")).toBe(true);
		expect(isValidScope("customers:create")).toBe(true);
	});

	test("returns false for garbage", () => {
		expect(isValidScope("")).toBe(false);
		expect(isValidScope("garbage")).toBe(false);
		expect(isValidScope("customers:garbage")).toBe(false);
		expect(isValidScope("analytics:write")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 3. parseScope
// ---------------------------------------------------------------------------

describe("parseScope", () => {
	test("parses every MODERN_SCOPES entry correctly", () => {
		for (const s of MODERN_SCOPES) {
			const { resource, action } = parseScope(s);
			expect(resource).not.toBeNull();
			expect(action).not.toBeNull();
			expect(`${resource}:${action}`).toBe(s);
		}
	});

	test("parses customers:read correctly", () => {
		expect(parseScope("customers:read")).toEqual({
			resource: "customers",
			action: "read",
		});
	});

	test("parses customers:write correctly", () => {
		expect(parseScope("customers:write")).toEqual({
			resource: "customers",
			action: "write",
		});
	});

	test("parses analytics:read correctly", () => {
		expect(parseScope("analytics:read")).toEqual({
			resource: "analytics",
			action: "read",
		});
	});

	test("parses platform:write correctly", () => {
		expect(parseScope("platform:write")).toEqual({
			resource: "platform",
			action: "write",
		});
	});

	test("returns null/null for legacy 'customers:create'", () => {
		expect(parseScope("customers:create")).toEqual({
			resource: null,
			action: null,
		});
	});

	test("returns null/null for meta 'admin'", () => {
		expect(parseScope("admin")).toEqual({
			resource: null,
			action: null,
		});
	});

	test("returns null/null for analytics:write (not modern)", () => {
		expect(parseScope("analytics:write")).toEqual({
			resource: null,
			action: null,
		});
	});

	test("returns null/null for malformed input: 'customers'", () => {
		expect(parseScope("customers")).toEqual({
			resource: null,
			action: null,
		});
	});

	test("returns null/null for empty string", () => {
		expect(parseScope("")).toEqual({ resource: null, action: null });
	});

	test("returns null/null for bare colon", () => {
		expect(parseScope(":")).toEqual({ resource: null, action: null });
	});

	test("returns null/null for three-part scope", () => {
		expect(parseScope("a:b:c")).toEqual({ resource: null, action: null });
	});

	test("returns null/null for 'customers:unknown'", () => {
		expect(parseScope("customers:unknown")).toEqual({
			resource: null,
			action: null,
		});
	});

	test("returns null/null for openid scopes", () => {
		expect(parseScope("openid")).toEqual({ resource: null, action: null });
		expect(parseScope("email")).toEqual({ resource: null, action: null });
	});
});

// ---------------------------------------------------------------------------
// 4. expandScopes
// ---------------------------------------------------------------------------

describe("expandScopes", () => {
	test("empty input → empty set", () => {
		expect([...expandScopes([])]).toEqual([]);
	});

	test("customers:read → just customers:read", () => {
		expect([...expandScopes(["customers:read"])].sort()).toEqual(
			["customers:read"],
		);
	});

	test("customers:write → customers:write + customers:read", () => {
		expect([...expandScopes(["customers:write"])].sort()).toEqual(
			["customers:read", "customers:write"],
		);
	});

	test("customers:write + customers:read → same (no duplication)", () => {
		const result = expandScopes(["customers:write", "customers:read"]);
		expect([...result].sort()).toEqual(["customers:read", "customers:write"]);
		expect(result.size).toBe(2);
	});

	test("legacy customers:list → customers:read", () => {
		expect([...expandScopes(["customers:list"])].sort()).toEqual(
			["customers:read"],
		);
	});

	test("legacy customers:create → customers:write + customers:read", () => {
		expect([...expandScopes(["customers:create"])].sort()).toEqual(
			["customers:read", "customers:write"],
		);
	});

	test("legacy customers:update → customers:write + customers:read", () => {
		expect([...expandScopes(["customers:update"])].sort()).toEqual(
			["customers:read", "customers:write"],
		);
	});

	test("legacy customers:delete → customers:write + customers:read", () => {
		expect([...expandScopes(["customers:delete"])].sort()).toEqual(
			["customers:read", "customers:write"],
		);
	});

	test("bare 'apiKeys' → apiKeys:write + apiKeys:read", () => {
		expect([...expandScopes(["apiKeys"])].sort()).toEqual(
			["apiKeys:read", "apiKeys:write"],
		);
	});

	test("meta 'admin' passes through as-is", () => {
		expect([...expandScopes(["admin"])]).toEqual(["admin"]);
	});

	test("meta 'superuser' passes through as-is", () => {
		expect([...expandScopes(["superuser"])]).toEqual(["superuser"]);
	});

	test("meta 'public' passes through as-is", () => {
		expect([...expandScopes(["public"])]).toEqual(["public"]);
	});

	test("meta 'owner' passes through as-is", () => {
		expect([...expandScopes(["owner"])]).toEqual(["owner"]);
	});

	test("unknown scopes silently dropped", () => {
		expect([...expandScopes(["garbage"])]).toEqual([]);
	});

	test("OpenID scopes silently dropped but valid modern scope retained", () => {
		expect(
			[...expandScopes(["openid", "email", "customers:read"])].sort(),
		).toEqual(["customers:read"]);
	});

	test("mixed input expanded correctly", () => {
		const result = expandScopes([
			"customers:write",
			"admin",
			"junk",
			"plans:list",
		]);
		expect([...result].sort()).toEqual([
			"admin",
			"customers:read",
			"customers:write",
			"plans:read",
		]);
	});

	test("all legacy aliases expand to a known modern scope (+ optional read)", () => {
		for (const [legacy, modern] of Object.entries(LEGACY_SCOPE_ALIASES)) {
			const expanded = expandScopes([legacy]);
			expect(expanded.has(modern)).toBe(true);
		}
	});

	test("analytics:write is dropped (not modern, not legacy)", () => {
		expect([...expandScopes(["analytics:write"])]).toEqual([]);
	});

	test("organisation:create → organisation:write + organisation:read", () => {
		expect([...expandScopes(["organisation:create"])].sort()).toEqual(
			["organisation:read", "organisation:write"],
		);
	});
});

// ---------------------------------------------------------------------------
// 5. ROLE_SCOPES
// ---------------------------------------------------------------------------

describe("ROLE_SCOPES", () => {
	test("owner contains 'owner', 'admin', and every MODERN_SCOPES entry", () => {
		expect(ROLE_SCOPES.owner).toContain("owner");
		expect(ROLE_SCOPES.owner).toContain("admin");
		for (const s of MODERN_SCOPES) {
			expect(ROLE_SCOPES.owner).toContain(s);
		}
	});

	test("admin contains 'admin' and every MODERN_SCOPES entry, but NOT 'owner'", () => {
		expect(ROLE_SCOPES.admin).toContain("admin");
		for (const s of MODERN_SCOPES) {
			expect(ROLE_SCOPES.admin).toContain(s);
		}
		expect(ROLE_SCOPES.admin).not.toContain("owner");
	});

	test("developer has the exact 9 expected scopes", () => {
		expect([...ROLE_SCOPES.developer].sort()).toEqual(
			[
				"organisation:read",
				"customers:write",
				"features:write",
				"plans:write",
				"balances:write",
				"billing:write",
				"analytics:read",
				"apiKeys:write",
				"platform:write",
			].sort(),
		);
		expect(ROLE_SCOPES.developer.length).toBe(9);
	});

	test("sales has the exact 7 expected scopes", () => {
		expect([...ROLE_SCOPES.sales].sort()).toEqual(
			[
				"customers:write",
				"billing:write",
				"rewards:write",
				"balances:write",
				"plans:read",
				"features:read",
				"analytics:read",
			].sort(),
		);
		expect(ROLE_SCOPES.sales.length).toBe(7);
	});

	test("member contains all :read scopes (count 10), no :write", () => {
		expect(ROLE_SCOPES.member.length).toBe(10);
		for (const s of ROLE_SCOPES.member) {
			expect(s.endsWith(":read")).toBe(true);
			expect(s.endsWith(":write")).toBe(false);
		}
		for (const r of RESOURCES) {
			expect(ROLE_SCOPES.member).toContain(`${r}:read` as ScopeString);
		}
	});
});

// ---------------------------------------------------------------------------
// 6. checkScopes
// ---------------------------------------------------------------------------

describe("checkScopes — shorthand array (ALL semantics)", () => {
	test("empty required + empty granted → allowed", () => {
		expect(checkScopes([], [])).toEqual({ allowed: true, missing: [] });
	});

	test("customers:read required, customers:read granted → allowed", () => {
		expect(checkScopes(["customers:read"], ["customers:read"])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("customers:read required, customers:write granted → allowed (write implies read)", () => {
		expect(checkScopes(["customers:read"], ["customers:write"])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("customers:write required, customers:read granted → blocked, missing customers:write", () => {
		expect(checkScopes(["customers:write"], ["customers:read"])).toEqual({
			allowed: false,
			missing: ["customers:write"],
		});
	});

	test("partial miss → blocked, missing contains only the missing one", () => {
		expect(
			checkScopes(
				["customers:read", "plans:read"],
				["customers:read"],
			),
		).toEqual({ allowed: false, missing: ["plans:read"] });
	});
});

describe("checkScopes — { ALL } semantics", () => {
	test("empty ALL → allowed vacuously", () => {
		expect(checkScopes({ ALL: [] }, [])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("ALL satisfied → allowed", () => {
		expect(
			checkScopes(
				{ ALL: ["customers:read", "plans:read"] },
				["customers:read", "plans:read"],
			),
		).toEqual({ allowed: true, missing: [] });
	});

	test("ALL with one missing → blocked", () => {
		expect(
			checkScopes(
				{ ALL: ["customers:read", "plans:read"] },
				["customers:read"],
			),
		).toEqual({ allowed: false, missing: ["plans:read"] });
	});
});

describe("checkScopes — { ANY } semantics", () => {
	test("one of the ANY matches → allowed", () => {
		expect(
			checkScopes(
				{ ANY: ["customers:read", "plans:read"] },
				["customers:read"],
			),
		).toEqual({ allowed: true, missing: [] });
	});

	test("none match → blocked, missing = full ANY list", () => {
		expect(
			checkScopes(
				{ ANY: ["customers:read", "plans:read"] },
				["rewards:read"],
			),
		).toEqual({
			allowed: false,
			missing: ["customers:read", "plans:read"],
		});
	});

	test("empty ANY with any granted → allowed (vacuous truth)", () => {
		expect(checkScopes({ ANY: [] }, ["customers:read"])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("empty ANY with empty granted → allowed", () => {
		expect(checkScopes({ ANY: [] }, [])).toEqual({
			allowed: true,
			missing: [],
		});
	});
});

describe("checkScopes — { ALL, ANY } semantics", () => {
	test("both satisfied → allowed", () => {
		expect(
			checkScopes(
				{
					ALL: ["customers:read"],
					ANY: ["plans:read", "rewards:read"],
				},
				["customers:read", "plans:read"],
			),
		).toEqual({ allowed: true, missing: [] });
	});

	test("ALL satisfied, ANY not → blocked with ANY list in missing", () => {
		expect(
			checkScopes(
				{
					ALL: ["customers:read"],
					ANY: ["plans:read", "rewards:read"],
				},
				["customers:read"],
			),
		).toEqual({
			allowed: false,
			missing: ["plans:read", "rewards:read"],
		});
	});

	test("ANY satisfied, ALL not → blocked with ALL-misses only", () => {
		expect(
			checkScopes(
				{
					ALL: ["customers:read", "features:read"],
					ANY: ["plans:read"],
				},
				["plans:read"],
			),
		).toEqual({
			allowed: false,
			missing: ["customers:read", "features:read"],
		});
	});

	test("neither satisfied → blocked with ALL-misses + ANY list", () => {
		expect(
			checkScopes(
				{
					ALL: ["customers:read", "features:read"],
					ANY: ["plans:read", "rewards:read"],
				},
				[],
			),
		).toEqual({
			allowed: false,
			missing: [
				"customers:read",
				"features:read",
				"plans:read",
				"rewards:read",
			],
		});
	});
});

describe("checkScopes — public bypass", () => {
	test("required = ['public'], granted = [] → allowed", () => {
		expect(checkScopes(["public"], [])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("required = { ANY: ['public'] }, granted = [] → allowed", () => {
		expect(checkScopes({ ANY: ["public"] }, [])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("required = { ALL: ['public'] }, granted = [] → allowed", () => {
		expect(checkScopes({ ALL: ["public"] }, [])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("public short-circuits even when other scopes also required", () => {
		expect(
			checkScopes(["customers:write", "public"], []),
		).toEqual({ allowed: true, missing: [] });
	});
});

describe("checkScopes — admin bypass", () => {
	test("admin grants customers:write", () => {
		expect(checkScopes(["customers:write"], ["admin"])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("admin does NOT satisfy superuser requirement", () => {
		expect(checkScopes(["superuser"], ["admin"])).toEqual({
			allowed: false,
			missing: ["superuser"],
		});
	});

	test("admin does NOT satisfy owner requirement", () => {
		expect(checkScopes(["owner"], ["admin"])).toEqual({
			allowed: false,
			missing: ["owner"],
		});
	});

	test("admin bypass SKIPPED if ANY mentions superuser (requirementMentions walks ALL+ANY)", () => {
		// NOTE: `requirementMentions` in the source inspects BOTH ALL and ANY
		// when deciding whether to skip the admin bypass. So mentioning
		// `superuser` anywhere — even as one of several ANY alternatives —
		// disables the admin short-circuit. Admin then falls through to the
		// expanded-set check, where it does NOT have `superuser` or
		// `customers:read` literally, so the ANY check fails.
		expect(
			checkScopes(
				{ ANY: ["superuser", "customers:read"] },
				["admin"],
			),
		).toEqual({
			allowed: false,
			missing: ["superuser", "customers:read"],
		});
	});

	test("admin bypass skipped if ALL contains superuser", () => {
		const res = checkScopes(
			{ ALL: ["superuser"] },
			["admin"],
		);
		expect(res.allowed).toBe(false);
		expect(res.missing).toContain("superuser" as ScopeString);
	});

	test("admin bypass skipped if ALL contains owner", () => {
		const res = checkScopes({ ALL: ["owner"] }, ["admin"]);
		expect(res.allowed).toBe(false);
		expect(res.missing).toContain("owner" as ScopeString);
	});

	test("admin grants multi-scope shorthand", () => {
		expect(
			checkScopes(
				["customers:write", "plans:write", "rewards:write"],
				["admin"],
			),
		).toEqual({ allowed: true, missing: [] });
	});
});

describe("checkScopes — owner & superuser grants", () => {
	test("owner granted, owner required → allowed", () => {
		expect(checkScopes(["owner"], ["owner"])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("superuser granted, superuser required → allowed", () => {
		expect(checkScopes(["superuser"], ["superuser"])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("superuser granted does NOT bypass product scope checks (checkScopes has no superuser bypass)", () => {
		// checkScopes only short-circuits on public and admin (not superuser).
		// superuser is passed through expandScopes as-is (preserved) but does
		// not imply customers:write — so this is blocked.
		expect(checkScopes(["customers:write"], ["superuser"])).toEqual({
			allowed: false,
			missing: ["customers:write"],
		});
	});

	test("owner grant does NOT bypass product scope checks", () => {
		expect(checkScopes(["customers:write"], ["owner"])).toEqual({
			allowed: false,
			missing: ["customers:write"],
		});
	});
});

describe("checkScopes — legacy & isolation", () => {
	test("legacy customers:list grants customers:read", () => {
		expect(checkScopes(["customers:read"], ["customers:list"])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("legacy customers:create grants customers:write (and read)", () => {
		expect(checkScopes(["customers:write"], ["customers:create"])).toEqual({
			allowed: true,
			missing: [],
		});
		expect(checkScopes(["customers:read"], ["customers:create"])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("bare legacy 'apiKeys' grants apiKeys:write", () => {
		expect(checkScopes(["apiKeys:write"], ["apiKeys"])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("cross-resource isolation: plans:read requested, customers:write granted → blocked", () => {
		expect(checkScopes(["plans:read"], ["customers:write"])).toEqual({
			allowed: false,
			missing: ["plans:read"],
		});
	});

	test("openid scope alone does not satisfy a resource requirement", () => {
		expect(checkScopes(["customers:read"], ["openid"])).toEqual({
			allowed: false,
			missing: ["customers:read"],
		});
	});

	test("garbage scope alone does not satisfy a resource requirement", () => {
		expect(checkScopes(["customers:read"], ["junk"])).toEqual({
			allowed: false,
			missing: ["customers:read"],
		});
	});
});

// ---------------------------------------------------------------------------
// 7. isScopeSubset
// ---------------------------------------------------------------------------

describe("isScopeSubset", () => {
	test("empty requested + empty granted → true", () => {
		expect(isScopeSubset([], [])).toBe(true);
	});

	test("empty requested + anything granted → true", () => {
		expect(isScopeSubset([], ["customers:read"])).toBe(true);
		expect(isScopeSubset([], ["admin"])).toBe(true);
	});

	test("identical single scope → true", () => {
		expect(isScopeSubset(["customers:read"], ["customers:read"])).toBe(true);
	});

	test("customers:read ⊆ customers:write (write implies read)", () => {
		expect(isScopeSubset(["customers:read"], ["customers:write"])).toBe(true);
	});

	test("customers:write NOT ⊆ customers:read", () => {
		expect(isScopeSubset(["customers:write"], ["customers:read"])).toBe(
			false,
		);
	});

	test("multi-scope requested vs multi-scope write grant", () => {
		expect(
			isScopeSubset(
				["customers:read", "plans:read"],
				["customers:write", "plans:write"],
			),
		).toBe(true);
	});

	test("cross-resource isolation", () => {
		expect(isScopeSubset(["customers:write"], ["plans:write"])).toBe(false);
	});

	test("admin in granted → any requested is a subset (even owner)", () => {
		expect(isScopeSubset(["owner"], ["admin"])).toBe(true);
		expect(isScopeSubset(["customers:write"], ["admin"])).toBe(true);
		expect(isScopeSubset(["superuser"], ["admin"])).toBe(true);
	});

	test("superuser in granted → any requested is a subset", () => {
		expect(isScopeSubset(["customers:write"], ["superuser"])).toBe(true);
		expect(isScopeSubset(["owner"], ["superuser"])).toBe(true);
	});

	test("legacy granted covers modern requested", () => {
		expect(isScopeSubset(["customers:write"], ["customers:create"])).toBe(
			true,
		);
	});

	test("requested contains unknown scope → dropped via expansion", () => {
		// both requested and granted go through expandScopes; garbage is dropped
		// so an all-garbage requested becomes empty set → subset trivially.
		expect(isScopeSubset(["garbage"], [])).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 8. makeScopeChecker
// ---------------------------------------------------------------------------

describe("makeScopeChecker", () => {
	test("empty grant — nothing passes", () => {
		const c = makeScopeChecker([]);
		expect(c.has("customers:read")).toBe(false);
		expect(c.has("customers:write")).toBe(false);
		expect(c.isAdmin).toBe(false);
		expect(c.isSuperuser).toBe(false);
	});

	test("admin grant — has() true for product scopes", () => {
		const c = makeScopeChecker(["admin"]);
		expect(c.has("customers:read")).toBe(true);
		expect(c.has("customers:write")).toBe(true);
		expect(c.has("analytics:read")).toBe(true);
		expect(c.has("platform:write")).toBe(true);
	});

	test("admin grant — has('superuser') → false", () => {
		const c = makeScopeChecker(["admin"]);
		expect(c.has("superuser")).toBe(false);
	});

	test("admin grant — has('owner') → false", () => {
		const c = makeScopeChecker(["admin"]);
		expect(c.has("owner")).toBe(false);
	});

	test("admin grant — has('admin') → true, isAdmin true", () => {
		const c = makeScopeChecker(["admin"]);
		expect(c.has("admin")).toBe(true);
		expect(c.isAdmin).toBe(true);
		expect(c.isSuperuser).toBe(false);
	});

	test("superuser grant — has() true for all", () => {
		const c = makeScopeChecker(["superuser"]);
		expect(c.has("customers:write")).toBe(true);
		expect(c.has("owner")).toBe(true);
		expect(c.has("admin")).toBe(true);
		expect(c.has("superuser")).toBe(true);
		expect(c.isSuperuser).toBe(true);
	});

	test("superuser grant — isAdmin reflects actual admin presence, not superuser", () => {
		const c = makeScopeChecker(["superuser"]);
		// isAdmin is literal admin check; superuser alone should not set isAdmin true
		expect(c.isAdmin).toBe(false);
	});

	test("customers:write expands to include customers:read via has()", () => {
		const c = makeScopeChecker(["customers:write"]);
		expect(c.has("customers:read")).toBe(true);
		expect(c.has("customers:write")).toBe(true);
	});

	test("customers:read does NOT imply customers:write via has()", () => {
		const c = makeScopeChecker(["customers:read"]);
		expect(c.has("customers:read")).toBe(true);
		expect(c.has("customers:write")).toBe(false);
	});

	test("hasAll — all present → true", () => {
		const c = makeScopeChecker(["customers:read", "plans:read"]);
		expect(c.hasAll(["customers:read", "plans:read"])).toBe(true);
	});

	test("hasAll — one missing → false", () => {
		const c = makeScopeChecker(["customers:read"]);
		expect(c.hasAll(["customers:read", "plans:read"])).toBe(false);
	});

	test("hasAll — empty list → true (vacuous)", () => {
		const c = makeScopeChecker([]);
		expect(c.hasAll([])).toBe(true);
	});

	test("hasAny — at least one present → true", () => {
		const c = makeScopeChecker(["customers:read"]);
		expect(c.hasAny(["customers:read", "plans:read"])).toBe(true);
	});

	test("hasAny — none present → false", () => {
		const c = makeScopeChecker(["customers:read"]);
		expect(c.hasAny(["plans:read", "rewards:read"])).toBe(false);
	});

	test("hasAny — empty list → false (vacuous)", () => {
		const c = makeScopeChecker(["customers:read"]);
		expect(c.hasAny([])).toBe(false);
	});

	test("check() delegates to checkScopes — shorthand array", () => {
		const c = makeScopeChecker(["customers:read"]);
		expect(c.check(["customers:read"])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("check() delegates — public bypass works", () => {
		const c = makeScopeChecker([]);
		expect(c.check(["public"])).toEqual({ allowed: true, missing: [] });
	});

	test("check() delegates — admin bypass works", () => {
		const c = makeScopeChecker(["admin"]);
		expect(c.check(["customers:write"])).toEqual({
			allowed: true,
			missing: [],
		});
	});

	test("check() — blocked path returns missing", () => {
		const c = makeScopeChecker(["customers:read"]);
		expect(c.check(["plans:write"])).toEqual({
			allowed: false,
			missing: ["plans:write"],
		});
	});

	test("expanded set contains write→read expansion", () => {
		const c = makeScopeChecker(["customers:write"]);
		expect(c.expanded.has("customers:read")).toBe(true);
		expect(c.expanded.has("customers:write")).toBe(true);
	});

	test("legacy input normalised in expanded set", () => {
		const c = makeScopeChecker(["customers:create"]);
		expect(c.expanded.has("customers:write")).toBe(true);
		expect(c.expanded.has("customers:read")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 9. Display helpers
// ---------------------------------------------------------------------------

describe("groupScopesByResource", () => {
	test("groups scopes by resource with actions sorted read-before-write", () => {
		const result = groupScopesByResource([
			"customers:write",
			"customers:read",
			"plans:read",
		]);
		expect(result.get("customers")).toEqual(["read", "write"]);
		expect(result.get("plans")).toEqual(["read"]);
	});

	test("customers:write alone → read + write (expansion)", () => {
		const result = groupScopesByResource(["customers:write"]);
		expect(result.get("customers")).toEqual(["read", "write"]);
	});

	test("legacy customers:list → customers: read only", () => {
		const result = groupScopesByResource(["customers:list"]);
		expect(result.get("customers")).toEqual(["read"]);
	});

	test("openid + admin dropped (meta has no resource)", () => {
		const result = groupScopesByResource([
			"openid",
			"admin",
			"customers:read",
		]);
		expect(result.size).toBe(1);
		expect(result.get("customers")).toEqual(["read"]);
	});

	test("empty input → empty map", () => {
		const result = groupScopesByResource([]);
		expect(result.size).toBe(0);
	});
});

describe("formatActions", () => {
	test("empty → ''", () => {
		expect(formatActions([])).toBe("");
	});

	test("['read'] → 'Read'", () => {
		expect(formatActions(["read"])).toBe("Read");
	});

	test("['write'] → 'Write'", () => {
		expect(formatActions(["write"])).toBe("Write");
	});

	test("['read', 'write'] → 'read and write' (source returns lowercase for 2+)", () => {
		// NOTE: despite the jsdoc claiming "Read and write", the actual
		// implementation lowercases every verb when there are 2+ actions
		// (see line 826: `sorted.map(a => ACTION_METADATA[a].verb.toLowerCase())`).
		// formatResourcePermission then capitalises the first char. This test
		// pins current behaviour; capitalisation is re-asserted at the
		// formatResourcePermission level.
		expect(formatActions(["read", "write"])).toBe("read and write");
	});

	test("['write', 'read'] also returns 'read and write' (sorted)", () => {
		expect(formatActions(["write", "read"])).toBe("read and write");
	});
});

describe("formatResourcePermission", () => {
	test("customers + ['read'] → 'Read customers'", () => {
		expect(formatResourcePermission("customers", ["read"])).toBe(
			"Read customers",
		);
	});

	test("plans + ['read', 'write'] → 'Read and write plans'", () => {
		expect(formatResourcePermission("plans", ["read", "write"])).toBe(
			"Read and write plans",
		);
	});

	test("apiKeys is pluralised via metadata ('API Keys')", () => {
		expect(formatResourcePermission("apiKeys", ["read"])).toBe(
			"Read api keys",
		);
	});
});

describe("groupAndFormatScopes", () => {
	test("produces one entry per resource with correct shape", () => {
		const result = groupAndFormatScopes([
			"customers:read",
			"plans:write",
		]);
		expect(result.length).toBe(2);

		const customers = result.find((e) => e.resource === "customers");
		expect(customers).toBeDefined();
		expect(customers!.resourceName).toBe("Customers");
		expect(customers!.actions).toEqual(["read"]);
		expect(customers!.formattedPermission).toBe("Read customers");
		expect(customers!.description).toBe(
			RESOURCE_METADATA.customers.description,
		);

		const plans = result.find((e) => e.resource === "plans");
		expect(plans).toBeDefined();
		expect(plans!.actions).toEqual(["read", "write"]); // write expands to read
		expect(plans!.formattedPermission).toBe("Read and write plans");
	});

	test("empty input → empty array", () => {
		expect(groupAndFormatScopes([])).toEqual([]);
	});

	test("garbage input → empty array", () => {
		expect(groupAndFormatScopes(["garbage", "openid"])).toEqual([]);
	});
});

describe("validateScopes", () => {
	test("partitions valid vs invalid", () => {
		const result = validateScopes([
			"customers:read",
			"customers:garbage",
			"openid",
		]);
		expect([...result.valid].sort()).toEqual(
			["customers:read", "openid"].sort(),
		);
		expect(result.invalid).toEqual(["customers:garbage"]);
	});

	test("all valid inputs → empty invalid", () => {
		const result = validateScopes(["customers:read", "admin", "openid"]);
		expect(result.invalid).toEqual([]);
		expect([...result.valid].sort()).toEqual(
			["admin", "customers:read", "openid"].sort(),
		);
	});

	test("all invalid inputs → empty valid", () => {
		const result = validateScopes(["garbage", "nonsense"]);
		expect(result.valid).toEqual([]);
		expect([...result.invalid].sort()).toEqual(["garbage", "nonsense"]);
	});

	test("legacy scopes count as valid", () => {
		const result = validateScopes(["customers:create", "apiKeys"]);
		expect(result.invalid).toEqual([]);
		expect([...result.valid].sort()).toEqual(
			["apiKeys", "customers:create"].sort(),
		);
	});

	test("empty input → both buckets empty", () => {
		expect(validateScopes([])).toEqual({ valid: [], invalid: [] });
	});

	test("analytics:write classified as invalid", () => {
		const result = validateScopes(["analytics:write"]);
		expect(result.valid).toEqual([]);
		expect(result.invalid).toEqual(["analytics:write"]);
	});
});

describe("getResourceDescription", () => {
	test("returns the metadata description for each resource", () => {
		for (const r of RESOURCES) {
			expect(getResourceDescription(r)).toBe(RESOURCE_METADATA[r].description);
		}
	});
});
