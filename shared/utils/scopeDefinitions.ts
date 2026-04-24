/**
 * OAuth 2.1 Scope Definitions for Autumn
 *
 * Scopes follow a Read/Write (R/W) model: `${resource}:${action}` where
 * `action` is either `read` or `write`. Write implies read.
 *
 * Resources:
 *   organisation, customers, features, plans, rewards,
 *   balances, billing, analytics, apiKeys
 *
 * Analytics is read-only: there is no `analytics:write` scope.
 *
 * The legacy CRUDL scopes (create/read/update/delete/list) remain accepted
 * at the `/authorize` boundary for in-flight tokens issued before this
 * migration. They are normalised into the modern R/W scopes via
 * `LEGACY_SCOPE_ALIASES` and should not be used in new code.
 */

// ---------------------------------------------------------------------------
// Resources & actions
// ---------------------------------------------------------------------------

/**
 * Canonical list of resources protected by scopes.
 *
 * Keep `apiKeys` in camelCase — this matches how the resource is referenced
 * throughout the codebase.
 */
export const RESOURCES = [
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
] as const;

export type ResourceType = (typeof RESOURCES)[number];

/** Modern scope actions. */
export type ScopeActionType = "read" | "write";

// ---------------------------------------------------------------------------
// Scope strings (type-level)
// ---------------------------------------------------------------------------

/**
 * All resources that support writing — i.e. every resource except analytics.
 *
 * We compute this via a conditional type so that the resulting `ScopeString`
 * union is exact: it contains `${WritableResource}:write` but never
 * `analytics:write`.
 */
type WritableResource = Exclude<ResourceType, "analytics">;

/**
 * Meta-scopes: not tied to a specific resource.
 *
 * - `superuser` — internal Autumn-staff scope. Gates admin-dashboard routes
 *   (e.g. `/admin/*`). Manually injected on requests where the
 *   better-auth session's `user.role === "admin"` (global admin, not org
 *   admin) or the session is an impersonation.
 *
 * - `owner` — org owner scope. Gates owner-only destructive actions
 *   (e.g. delete organisation, transfer ownership). The `admin` meta-scope
 *   does NOT satisfy an `owner` requirement — owner is strictly narrower.
 *
 * - `admin` — universal bypass for product-level scopes. A caller with
 *   this scope passes every scope check that does not explicitly require
 *   `superuser`, `owner`, or `public` (see {@link checkScopes}). Granted
 *   to the org owner/admin roles so they can do anything non-destructive
 *   across the product.
 *
 * - `public` — explicit declaration that a route requires NO scopes.
 *   When a route declares `scopes: [Scopes.Public]` the scope-check
 *   middleware short-circuits regardless of what the caller has (or
 *   doesn't have). Used for:
 *     - truly unauthenticated endpoints (e.g. checkout links, hosted
 *       invoice redirects) where authorisation comes from possession of
 *       a URL-embedded token, not from a session/key;
 *     - authenticated-but-universally-accessible endpoints (e.g. feedback
 *       submission, org feature flags, saved views) where the upstream
 *       auth middleware has already validated the session and no
 *       per-action gating is desired.
 *
 *   Prefer `public` over the old empty-scopes fail-open: declaring it
 *   explicitly makes intent visible in the route file and at the call
 *   site in the picker. Future work can replace the fail-open with
 *   fail-closed on empty scopes without breaking these routes.
 */
export const META_SCOPES = ["superuser", "owner", "admin", "public"] as const;
export type MetaScope = (typeof META_SCOPES)[number];

/**
 * Exact template-literal union of every valid scope string.
 *
 * Includes modern R/W scopes plus the meta-scopes. Intentionally NOT
 * `${ResourceType}:${ScopeActionType}`, because that would erroneously
 * include `"analytics:write"`.
 */
export type ScopeString =
	| `${ResourceType}:read`
	| `${WritableResource}:write`
	| MetaScope;

// ---------------------------------------------------------------------------
// Scopes namespace (mirrors the AffectedResource enum pattern)
// ---------------------------------------------------------------------------

/**
 * Namespaced constants for every modern scope string.
 *
 * Use these in handlers and route definitions rather than stringly-typed
 * literals, e.g. `Scopes.Customers.Write`.
 */
export const Scopes = {
	Organisation: {
		Read: "organisation:read",
		Write: "organisation:write",
	},
	Customers: {
		Read: "customers:read",
		Write: "customers:write",
	},
	Features: {
		Read: "features:read",
		Write: "features:write",
	},
	Plans: {
		Read: "plans:read",
		Write: "plans:write",
	},
	Rewards: {
		Read: "rewards:read",
		Write: "rewards:write",
	},
	Balances: {
		Read: "balances:read",
		Write: "balances:write",
	},
	Billing: {
		Read: "billing:read",
		Write: "billing:write",
	},
	Analytics: {
		Read: "analytics:read",
	},
	ApiKeys: {
		Read: "apiKeys:read",
		Write: "apiKeys:write",
	},
	/**
	 * Platform API resource. Gates `/v1/platform/*` routes that operate
	 * across multiple tenant orgs (used by platform partners embedding
	 * Autumn billing on behalf of their end-users).
	 */
	Platform: {
		Read: "platform:read",
		Write: "platform:write",
	},
	/**
	 * Internal Autumn-staff scope. Gates admin-dashboard routes.
	 * See {@link META_SCOPES}.
	 */
	Superuser: "superuser",
	/**
	 * Org owner scope. Gates destructive owner-only actions. Narrower
	 * than {@link Scopes.Admin}: admin does not satisfy owner.
	 * See {@link META_SCOPES}.
	 */
	Owner: "owner",
	/**
	 * Product-level universal bypass. Short-circuits every scope check
	 * that does not explicitly require `superuser`, `owner`, or `public`.
	 * See {@link META_SCOPES}.
	 */
	Admin: "admin",
	/**
	 * Declares the route needs NO scopes. Short-circuits the scope-check
	 * middleware unconditionally. See {@link META_SCOPES}.
	 */
	Public: "public",
} as const;

// ---------------------------------------------------------------------------
// Scope lists
// ---------------------------------------------------------------------------

/**
 * Flat list of every modern R/W scope derived from {@link Scopes}.
 *
 * Order is stable: for each resource we emit `:read` then `:write` (when it
 * exists), in the order defined by {@link RESOURCES}.
 */
export const MODERN_SCOPES: readonly ScopeString[] = [
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
] as const;

/**
 * Standard OpenID Connect scopes (for compatibility with OIDC clients).
 */
export const OPENID_SCOPES = [
	"openid",
	"profile",
	"email",
	"offline_access",
] as const;

/**
 * Legacy CRUDL scopes — still accepted at `/authorize` so in-flight tokens
 * continue to work. New code should emit modern R/W scopes instead.
 *
 * Also includes the bare `"apiKeys"` token historically used as a catch-all
 * for API key management.
 *
 * @deprecated Use the modern R/W scopes in {@link MODERN_SCOPES}.
 */
export const LEGACY_SCOPES = [
	// Organisation (no list — user is already scoped to an org)
	"organisation:create",
	"organisation:update",
	"organisation:delete",

	// Customers
	"customers:create",
	"customers:update",
	"customers:delete",
	"customers:list",

	// Features
	"features:create",
	"features:update",
	"features:delete",
	"features:list",

	// Plans
	"plans:create",
	"plans:update",
	"plans:delete",
	"plans:list",

	// API Keys
	"apiKeys:create",
	"apiKeys:update",
	"apiKeys:delete",
	"apiKeys:list",

	// Legacy bare-resource token (implied full access)
	"apiKeys",
] as const;

export type LegacyScope = (typeof LEGACY_SCOPES)[number];

/**
 * Maps legacy CRUDL scopes (and the bare `"apiKeys"` token) onto their
 * modern R/W equivalents.
 *
 * Convention: `create | update | delete` → `:write`, `list` → `:read`.
 * The legacy bare `"apiKeys"` token implied full access, so it maps to
 * `apiKeys:write` (which transitively grants `apiKeys:read` via
 * {@link expandScopes}).
 */
export const LEGACY_SCOPE_ALIASES: Record<string, ScopeString> = {
	// Organisation
	"organisation:create": Scopes.Organisation.Write,
	"organisation:update": Scopes.Organisation.Write,
	"organisation:delete": Scopes.Organisation.Write,

	// Customers
	"customers:create": Scopes.Customers.Write,
	"customers:update": Scopes.Customers.Write,
	"customers:delete": Scopes.Customers.Write,
	"customers:list": Scopes.Customers.Read,

	// Features
	"features:create": Scopes.Features.Write,
	"features:update": Scopes.Features.Write,
	"features:delete": Scopes.Features.Write,
	"features:list": Scopes.Features.Read,

	// Plans
	"plans:create": Scopes.Plans.Write,
	"plans:update": Scopes.Plans.Write,
	"plans:delete": Scopes.Plans.Write,
	"plans:list": Scopes.Plans.Read,

	// API Keys
	"apiKeys:create": Scopes.ApiKeys.Write,
	"apiKeys:update": Scopes.ApiKeys.Write,
	"apiKeys:delete": Scopes.ApiKeys.Write,
	"apiKeys:list": Scopes.ApiKeys.Read,

	// Bare legacy token
	apiKeys: Scopes.ApiKeys.Write,
};

/**
 * All scope strings accepted by the authorization server: OpenID +
 * modern R/W + meta + legacy CRUDL.
 */
export const ALL_SCOPES = [
	...OPENID_SCOPES,
	...MODERN_SCOPES,
	...META_SCOPES,
	...LEGACY_SCOPES,
] as const;

// ---------------------------------------------------------------------------
// Route requirements
// ---------------------------------------------------------------------------

/**
 * Describes the scope(s) a route requires.
 *
 * - `readonly ScopeString[]` — shorthand for "ALL of these required".
 * - `{ ALL }` — every listed scope required.
 * - `{ ANY }` — at least one of the listed scopes required.
 * - `{ ALL, ANY }` — both conditions must hold.
 */
export type RouteScopeRequirement =
	| readonly ScopeString[]
	| { ANY: readonly ScopeString[] }
	| { ALL: readonly ScopeString[] }
	| { ANY: readonly ScopeString[]; ALL: readonly ScopeString[] };

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type Role = "owner" | "admin" | "developer" | "sales" | "member";

/**
 * Default scope grants per role.
 *
 * - `owner` receives `owner` + `admin` meta-scopes — full access
 *   including destructive owner-only actions.
 * - `admin` receives only `admin` — full product access but NOT
 *   owner-gated actions (e.g. delete organisation).
 * - Neither automatically receives `superuser`: that is manually
 *   injected at the request layer for Autumn staff only (see
 *   useAdmin on the client; customSessionScopes on the server).
 */
export const ROLE_SCOPES: Record<Role, ScopeString[]> = {
	owner: ["owner", "admin", ...MODERN_SCOPES],
	admin: ["admin", ...MODERN_SCOPES],
	developer: [
		Scopes.Rewards.Write,
		Scopes.Organisation.Read,
		Scopes.Customers.Write,
		Scopes.Features.Write,
		Scopes.Plans.Write,
		Scopes.Balances.Write,
		Scopes.Billing.Write,
		Scopes.Analytics.Read,
		Scopes.ApiKeys.Write,
		Scopes.Platform.Write,
	],
	sales: [
		Scopes.Customers.Write,
		Scopes.Billing.Write,
		Scopes.Rewards.Write,
		Scopes.Balances.Write,
		Scopes.Plans.Read,
		Scopes.Features.Read,
		Scopes.Analytics.Read,
	],
	member: [
		Scopes.Organisation.Read,
		Scopes.Customers.Read,
		Scopes.Features.Read,
		Scopes.Plans.Read,
		Scopes.Rewards.Read,
		Scopes.Balances.Read,
		Scopes.Billing.Read,
		Scopes.Analytics.Read,
		Scopes.ApiKeys.Read,
		Scopes.Platform.Read,
	],
};

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * Resource metadata for display purposes.
 */
export const RESOURCE_METADATA: Record<
	ResourceType,
	{
		name: string;
		namePlural: string;
		description: string;
	}
> = {
	organisation: {
		name: "Organisation",
		namePlural: "Organisation",
		description: "Your organization settings, members, and integrations",
	},
	customers: {
		name: "Customer",
		namePlural: "Customers",
		description: "Customer records and entities",
	},
	features: {
		name: "Feature",
		namePlural: "Features",
		description: "Product features and configurations",
	},
	plans: {
		name: "Plan",
		namePlural: "Plans",
		description: "Pricing plans and subscriptions",
	},
	rewards: {
		name: "Reward",
		namePlural: "Rewards",
		description: "Referrals and reward codes",
	},
	balances: {
		name: "Balance",
		namePlural: "Balances",
		description: "Customer balances and usage tracking",
	},
	billing: {
		name: "Billing",
		namePlural: "Billing",
		description: "Attach, cancel, and update subscriptions",
	},
	analytics: {
		name: "Analytics",
		namePlural: "Analytics",
		description: "Revenue and event analytics (read-only)",
	},
	apiKeys: {
		name: "API Key",
		namePlural: "API Keys",
		description: "API keys for programmatic access",
	},
	platform: {
		name: "Platform",
		namePlural: "Platform",
		description:
			"Multi-tenant Platform API for partners embedding Autumn on behalf of end-user orgs",
	},
};

/**
 * Action metadata for display purposes.
 */
export const ACTION_METADATA: Record<
	ScopeActionType,
	{
		verb: string;
		description: string;
		order: number;
	}
> = {
	read: {
		verb: "Read",
		description: "View existing records",
		order: 1,
	},
	write: {
		verb: "Write",
		description: "Create, update, and delete records",
		order: 2,
	},
};

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/**
 * Check if a scope is an OpenID Connect scope (not a resource scope).
 */
export function isOpenIdScope(scope: string): boolean {
	return (OPENID_SCOPES as readonly string[]).includes(scope);
}

/**
 * Check if a scope is a modern R/W scope.
 */
export function isModernScope(scope: string): scope is ScopeString {
	return (MODERN_SCOPES as readonly string[]).includes(scope);
}

/**
 * Check if a scope is a legacy CRUDL scope (or the bare `"apiKeys"` token).
 *
 * @deprecated Legacy detection exists for migration only.
 */
export function isLegacyScope(scope: string): boolean {
	return (LEGACY_SCOPES as readonly string[]).includes(scope);
}

/**
 * Check if a scope is syntactically valid — i.e. appears in {@link ALL_SCOPES}.
 */
export function isValidScope(scope: string): scope is ScopeString {
	return (ALL_SCOPES as readonly string[]).includes(scope);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a modern R/W scope string into its resource and action parts.
 *
 * Returns `{ resource: null, action: null }` for OpenID scopes, legacy
 * CRUDL scopes, and malformed inputs. Callers that need to handle legacy
 * scopes semantically should normalise them first via
 * {@link LEGACY_SCOPE_ALIASES}.
 */
export function parseScope(scope: string): {
	resource: ResourceType | null;
	action: ScopeActionType | null;
} {
	if (!isModernScope(scope)) {
		return { resource: null, action: null };
	}

	const [resource, action] = scope.split(":") as [
		ResourceType,
		ScopeActionType,
	];

	return { resource, action };
}

// ---------------------------------------------------------------------------
// Expansion & checking
// ---------------------------------------------------------------------------

/**
 * Check if a scope is a meta-scope.
 */
export function isMetaScope(scope: string): scope is MetaScope {
	return (META_SCOPES as readonly string[]).includes(scope);
}

/**
 * Normalise an arbitrary list of granted scopes into a set of known scopes.
 *
 * Steps:
 *   1. Legacy CRUDL scopes are rewritten via {@link LEGACY_SCOPE_ALIASES}.
 *   2. OpenID and unknown scopes are dropped.
 *   3. Meta-scopes expand hierarchically. The hierarchy is:
 *        superuser > owner > admin > product-scopes
 *      so:
 *        - `superuser` in grant → expands to: superuser, owner, admin,
 *          and every modern R/W scope
 *        - `owner`     in grant → expands to: owner, admin, and every
 *          modern R/W scope
 *        - `admin`     in grant → expands to: admin, and every modern
 *          R/W scope
 *        - `public`    in grant → expands to: public (no hierarchy
 *          involvement — it's a route-side declaration)
 *
 *      Equivalently, satisfaction semantics at the requirement end:
 *        - A `superuser` requirement is satisfied ONLY by `superuser`.
 *        - An `owner`     requirement is satisfied by `superuser` or `owner`.
 *        - An `admin`     requirement is satisfied by `superuser`, `owner`, or `admin`.
 *        - A product-scope requirement is satisfied by admin / owner /
 *          superuser / the exact scope.
 *
 *      This is the single source of truth for the hierarchy — `checkScopes`,
 *      `isScopeSubset`, and `makeScopeChecker` all rely on this expansion
 *      rather than re-implementing the hierarchy.
 *   4. For every `:write`, the corresponding `:read` is added (write
 *      implies read).
 */
export function expandScopes(scopes: readonly string[]): Set<ScopeString> {
	const expanded = new Set<ScopeString>();

	for (const raw of scopes) {
		let scope: string = raw;

		// Legacy → modern
		if (LEGACY_SCOPE_ALIASES[scope]) {
			scope = LEGACY_SCOPE_ALIASES[scope];
		}

		// Meta-scope hierarchy: superuser > owner > admin.
		// `public` does not participate in the hierarchy — it's a
		// route-side declaration meaning "no scopes required".
		if (isMetaScope(scope)) {
			expanded.add(scope);
			if (scope === "superuser") {
				expanded.add("owner");
				expanded.add("admin");
			} else if (scope === "owner") {
				expanded.add("admin");
			}
			continue;
		}

		if (!isModernScope(scope)) continue;

		expanded.add(scope);

		// Write implies read
		if (scope.endsWith(":write")) {
			const resource = scope.slice(0, -":write".length) as ResourceType;
			const readScope = `${resource}:read` as ScopeString;
			expanded.add(readScope);
		}
	}

	// `admin` (by itself, or via expansion from owner/superuser) grants
	// every product-scope. This is the product-level catch-all.
	if (expanded.has("admin")) {
		for (const scope of MODERN_SCOPES) {
			expanded.add(scope);
		}
	}

	return expanded;
}

/**
 * Returns true if the route's requirement mentions any of the given
 * scope strings anywhere (plain array, ALL, or ANY).
 */
function requirementMentions(
	req: RouteScopeRequirement,
	needles: readonly string[],
): boolean {
	const hay = Array.isArray(req)
		? req
		: [
				...((req as { ALL?: readonly ScopeString[] }).ALL ?? []),
				...((req as { ANY?: readonly ScopeString[] }).ANY ?? []),
			];
	return needles.some((n) => hay.includes(n as ScopeString));
}

/**
 * Check whether a set of granted scopes satisfies a route's requirement.
 *
 * `granted` may contain legacy scopes; normalisation (and write→read
 * expansion and meta-scope hierarchy expansion) happens internally via
 * {@link expandScopes}.
 *
 * One short-circuit:
 *   - If the route's requirement includes `public`, the check passes
 *     for EVERY caller regardless of what they have. Used for truly
 *     unauthenticated endpoints and authed-but-universally-accessible
 *     ones. See {@link META_SCOPES}.
 *
 * All other behaviour falls out of the expansion in `expandScopes`:
 * superuser > owner > admin > product-scopes. Requirement-side
 * satisfaction is literal `expanded.has(scope)` membership.
 */
export function checkScopes(
	required: RouteScopeRequirement,
	granted: readonly string[],
): { allowed: boolean; missing: ScopeString[] } {
	// Public short-circuit: route explicitly declared no scopes required.
	if (requirementMentions(required, ["public"])) {
		return { allowed: true, missing: [] };
	}

	const expanded = expandScopes(granted);

	// Shorthand: a plain array means ALL required.
	if (Array.isArray(required)) {
		const missing = required.filter((s) => !expanded.has(s));
		return { allowed: missing.length === 0, missing };
	}

	const req = required as {
		ALL?: readonly ScopeString[];
		ANY?: readonly ScopeString[];
	};

	const allList = req.ALL ?? [];
	const anyList = req.ANY ?? [];

	const missingAll = allList.filter((s) => !expanded.has(s));
	const anySatisfied =
		anyList.length === 0 || anyList.some((s) => expanded.has(s));

	const allOk = missingAll.length === 0;
	const allowed = allOk && anySatisfied;

	if (allowed) {
		return { allowed: true, missing: [] };
	}

	// Build missing list. ALL misses are always included. If the ANY
	// condition failed, include the full ANY list so callers can surface
	// "one of the following".
	const missing: ScopeString[] = [...missingAll];
	if (!anySatisfied) {
		for (const s of anyList) {
			if (!missing.includes(s)) missing.push(s);
		}
	}

	return { allowed: false, missing };
}

/**
 * Check whether every scope in `requested` is granted by `granted`.
 *
 * Applies `expandScopes` to both sides so legacy scopes, write→read
 * expansion, and the meta-scope hierarchy are handled correctly via the
 * single source of truth in `expandScopes`.
 *
 * Returns true if requested is a subset of the expanded grant. Useful
 * for privilege-escalation guards: "can this caller mint a key with
 * these scopes?"
 *
 * Edge case:
 *   - Empty `requested` → always true (unrestricted key, no new privs).
 */
export function isScopeSubset(
	requested: readonly string[],
	granted: readonly string[],
): boolean {
	if (requested.length === 0) return true;
	const expandedGranted = expandScopes(granted);
	return [...expandScopes(requested)].every((s) => expandedGranted.has(s));
}

/**
 * Scope checker with memoised expansion. Call this once per auth
 * boundary (request, session load, useScopes hook) and pass the result
 * around instead of re-running `expandScopes` on every check.
 *
 * Semantics are driven entirely by the hierarchy expansion in
 * {@link expandScopes}:
 *   - `has("customers:read")` on an admin grant → true (admin expands to
 *     every modern product scope).
 *   - `has("owner")` on an admin grant → false (admin does NOT grant owner).
 *   - `has("owner")` on a superuser grant → true (superuser → owner → admin).
 *   - `has("superuser")` on an owner grant → false (owner does NOT grant
 *     superuser — superuser is strictly narrower).
 *
 * The `isAdmin` / `isOwner` / `isSuperuser` booleans reflect CAPABILITY,
 * not literal scope membership. `isAdmin` is true whenever the caller can
 * satisfy an admin-level requirement (i.e. admin, owner, or superuser
 * was granted).
 *
 * `check(required)` delegates to {@link checkScopes} unchanged, so the
 * public-bypass and requirement-shape handling (array / ALL / ANY /
 * ALL+ANY) apply.
 *
 * @example
 *   const { has, hasAny } = makeScopeChecker(ctx.scopes);
 *   if (!has("customers:write")) throw new RecaseError({ code: ErrCode.InsufficientScopes });
 */
export function makeScopeChecker(granted: readonly string[]) {
	const expanded = expandScopes(granted);
	const isAdmin = expanded.has("admin");
	const isOwner = expanded.has("owner");
	const isSuperuser = expanded.has("superuser");

	const has = (scope: ScopeString): boolean => expanded.has(scope);
	const hasAny = (scopes: readonly ScopeString[]): boolean => scopes.some(has);
	const hasAll = (scopes: readonly ScopeString[]): boolean => scopes.every(has);
	const check = (required: RouteScopeRequirement) =>
		checkScopes(required, granted);

	return {
		expanded,
		isAdmin,
		isOwner,
		isSuperuser,
		has,
		hasAny,
		hasAll,
		check,
	};
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/**
 * Group scopes by resource. Filters out OpenID scopes and normalises any
 * legacy scopes into their modern R/W equivalents before grouping.
 */
export function groupScopesByResource(
	scopes: string[],
): Map<ResourceType, ScopeActionType[]> {
	const expanded = expandScopes(scopes);
	const grouped = new Map<ResourceType, ScopeActionType[]>();

	for (const scope of expanded) {
		const { resource, action } = parseScope(scope);
		if (!resource || !action) continue;

		const existing = grouped.get(resource) ?? [];
		if (!existing.includes(action)) existing.push(action);
		grouped.set(resource, existing);
	}

	// Stable ordering: read before write.
	for (const [resource, actions] of grouped.entries()) {
		actions.sort((a, b) => ACTION_METADATA[a].order - ACTION_METADATA[b].order);
		grouped.set(resource, actions);
	}

	return grouped;
}

/**
 * Format actions into a human-readable string.
 *
 * Examples:
 *   ["read"]          -> "Read"
 *   ["read", "write"] -> "Read and write"
 */
export function formatActions(actions: ScopeActionType[]): string {
	if (actions.length === 0) return "";
	if (actions.length === 1) return ACTION_METADATA[actions[0]].verb;

	const sorted = [...actions].sort(
		(a, b) => ACTION_METADATA[a].order - ACTION_METADATA[b].order,
	);

	const verbs = sorted.map((a) => ACTION_METADATA[a].verb.toLowerCase());

	if (verbs.length === 2) {
		return `${verbs[0]} and ${verbs[1]}`;
	}

	const last = verbs.pop();
	return `${verbs.join(", ")}, and ${last}`;
}

/**
 * Format a resource with actions into a human-readable description.
 *
 * Examples:
 *   (customers, ["read"])          -> "Read customers"
 *   (plans,     ["read", "write"]) -> "Read and write plans"
 */
export function formatResourcePermission(
	resource: ResourceType,
	actions: ScopeActionType[],
): string {
	const actionString = formatActions(actions);
	const resourceName = RESOURCE_METADATA[resource].namePlural.toLowerCase();

	return `${actionString.charAt(0).toUpperCase()}${actionString.slice(1)} ${resourceName}`;
}

/**
 * Get a description for a resource.
 */
export function getResourceDescription(resource: ResourceType): string {
	return RESOURCE_METADATA[resource].description;
}

/**
 * Validate an array of scopes, partitioning into valid and invalid buckets.
 *
 * Both modern R/W scopes and legacy CRUDL scopes count as valid (since the
 * latter are still accepted at `/authorize`). OpenID scopes also count.
 */
export function validateScopes(scopes: string[]): {
	valid: ScopeString[];
	invalid: string[];
} {
	const valid: ScopeString[] = [];
	const invalid: string[] = [];

	for (const scope of scopes) {
		if (isValidScope(scope)) {
			valid.push(scope);
		} else {
			invalid.push(scope);
		}
	}

	return { valid, invalid };
}

/**
 * Shape of a grouped permission entry suitable for UI rendering.
 */
export interface GroupedPermission {
	resource: ResourceType;
	resourceName: string;
	actions: ScopeActionType[];
	formattedPermission: string;
	description: string;
}

/**
 * Group and format scopes for display. Returns one entry per resource
 * present in the input, with a human-readable permission string.
 */
export function groupAndFormatScopes(scopes: string[]): GroupedPermission[] {
	const grouped = groupScopesByResource(scopes);
	const result: GroupedPermission[] = [];

	for (const [resource, actions] of grouped.entries()) {
		result.push({
			resource,
			resourceName: RESOURCE_METADATA[resource].namePlural,
			actions,
			formattedPermission: formatResourcePermission(resource, actions),
			description: RESOURCE_METADATA[resource].description,
		});
	}

	return result;
}
