export const RESOURCES = [
	"organisation",
	"customers",
	"features",
	"plans",
	"rewards",
	"balances",
	"billing",
	"migrations",
	"analytics",
	"apiKeys",
	"platform",
] as const;

export type ResourceType = (typeof RESOURCES)[number];

export type ScopeActionType = "read" | "write";

type WritableResource = Exclude<ResourceType, "analytics">;

export const META_SCOPES = ["superuser", "owner", "admin", "public"] as const;
export type MetaScope = (typeof META_SCOPES)[number];

export type ScopeString =
	| `${ResourceType}:read`
	| `${WritableResource}:write`
	| MetaScope;

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
	Migrations: {
		Read: "migrations:read",
		Write: "migrations:write",
	},
	Analytics: {
		Read: "analytics:read",
	},
	ApiKeys: {
		Read: "apiKeys:read",
		Write: "apiKeys:write",
	},
	Platform: {
		Read: "platform:read",
		Write: "platform:write",
	},
	Superuser: "superuser",
	Owner: "owner",
	Admin: "admin",
	Public: "public",
} as const;

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
	Scopes.Migrations.Read,
	Scopes.Migrations.Write,
	Scopes.Analytics.Read,
	Scopes.ApiKeys.Read,
	Scopes.ApiKeys.Write,
	Scopes.Platform.Read,
	Scopes.Platform.Write,
] as const;

export const OFFLINE_ACCESS_SCOPE = "offline_access";

export const OPENID_SCOPES = [
	"openid",
	"profile",
	"email",
	OFFLINE_ACCESS_SCOPE,
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
	"organisation:create",
	"organisation:update",
	"organisation:delete",

	"customers:create",
	"customers:update",
	"customers:delete",
	"customers:list",

	"features:create",
	"features:update",
	"features:delete",
	"features:list",

	"plans:create",
	"plans:update",
	"plans:delete",
	"plans:list",

	"apiKeys:create",
	"apiKeys:update",
	"apiKeys:delete",
	"apiKeys:list",

	"apiKeys",
] as const;

export type LegacyScope = (typeof LEGACY_SCOPES)[number];

export const LEGACY_SCOPE_ALIASES: Record<string, ScopeString> = {
	"organisation:create": Scopes.Organisation.Write,
	"organisation:update": Scopes.Organisation.Write,
	"organisation:delete": Scopes.Organisation.Write,

	"customers:create": Scopes.Customers.Write,
	"customers:update": Scopes.Customers.Write,
	"customers:delete": Scopes.Customers.Write,
	"customers:list": Scopes.Customers.Read,

	"features:create": Scopes.Features.Write,
	"features:update": Scopes.Features.Write,
	"features:delete": Scopes.Features.Write,
	"features:list": Scopes.Features.Read,

	"plans:create": Scopes.Plans.Write,
	"plans:update": Scopes.Plans.Write,
	"plans:delete": Scopes.Plans.Write,
	"plans:list": Scopes.Plans.Read,

	"apiKeys:create": Scopes.ApiKeys.Write,
	"apiKeys:update": Scopes.ApiKeys.Write,
	"apiKeys:delete": Scopes.ApiKeys.Write,
	"apiKeys:list": Scopes.ApiKeys.Read,

	apiKeys: Scopes.ApiKeys.Write,
};

export const ALL_SCOPES = [
	...OPENID_SCOPES,
	...MODERN_SCOPES,
	...META_SCOPES,
	...LEGACY_SCOPES,
] as const;

export type RouteScopeRequirement =
	| readonly ScopeString[]
	| { ANY: readonly ScopeString[] }
	| { ALL: readonly ScopeString[] }
	| { ANY: readonly ScopeString[]; ALL: readonly ScopeString[] };

export type Role = "owner" | "admin" | "developer" | "sales" | "member";

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
		Scopes.Migrations.Write,
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
	migrations: {
		name: "Migration",
		namePlural: "Migrations",
		description: "Bulk customer migrations and operations",
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

export function isOpenIdScope(scope: string): boolean {
	return (OPENID_SCOPES as readonly string[]).includes(scope);
}

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

export function isValidScope(scope: string): scope is ScopeString {
	return (ALL_SCOPES as readonly string[]).includes(scope);
}

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

export function isMetaScope(scope: string): scope is MetaScope {
	return (META_SCOPES as readonly string[]).includes(scope);
}

export function expandScopes(scopes: readonly string[]): Set<ScopeString> {
	const expanded = new Set<ScopeString>();

	for (const raw of scopes) {
		let scope: string = raw;

		const modernScope = LEGACY_SCOPE_ALIASES[scope];
		if (modernScope) {
			scope = modernScope;
		}

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

		if (scope.endsWith(":write")) {
			const resource = scope.slice(0, -":write".length) as ResourceType;
			const readScope = `${resource}:read` as ScopeString;
			expanded.add(readScope);
		}
	}

	if (expanded.has("admin")) {
		for (const scope of MODERN_SCOPES) {
			expanded.add(scope);
		}
	}

	return expanded;
}

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

function normaliseRequiredScope(scope: ScopeString): ScopeString {
	return (LEGACY_SCOPE_ALIASES[scope] ?? scope) as ScopeString;
}

export function checkScopes(
	required: RouteScopeRequirement,
	granted: readonly string[],
): { allowed: boolean; missing: ScopeString[] } {
	if (requirementMentions(required, ["public"])) {
		return { allowed: true, missing: [] };
	}

	const expanded = expandScopes(granted);

	if (Array.isArray(required)) {
		const missing = required
			.map(normaliseRequiredScope)
			.filter((s) => !expanded.has(s));
		return { allowed: missing.length === 0, missing };
	}

	const req = required as {
		ALL?: readonly ScopeString[];
		ANY?: readonly ScopeString[];
	};

	const allList = (req.ALL ?? []).map(normaliseRequiredScope);
	const anyList = (req.ANY ?? []).map(normaliseRequiredScope);

	const missingAll = allList.filter((s) => !expanded.has(s));
	const anySatisfied =
		anyList.length === 0 || anyList.some((s) => expanded.has(s));

	const allOk = missingAll.length === 0;
	const allowed = allOk && anySatisfied;

	if (allowed) {
		return { allowed: true, missing: [] };
	}

	const missing: ScopeString[] = [...missingAll];
	if (!anySatisfied) {
		for (const s of anyList) {
			if (!missing.includes(s)) missing.push(s);
		}
	}

	return { allowed: false, missing };
}

export function isScopeSubset(
	requested: readonly string[],
	granted: readonly string[],
): boolean {
	if (requested.length === 0) return true;
	const expandedGranted = expandScopes(granted);
	return [...expandScopes(requested)].every((s) => expandedGranted.has(s));
}

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

	for (const [resource, actions] of grouped.entries()) {
		actions.sort((a, b) => ACTION_METADATA[a].order - ACTION_METADATA[b].order);
		grouped.set(resource, actions);
	}

	return grouped;
}

export function formatActions(actions: ScopeActionType[]): string {
	if (actions.length === 0) return "";
	const firstAction = actions[0];
	if (actions.length === 1 && firstAction) {
		return ACTION_METADATA[firstAction].verb;
	}

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

export function formatResourcePermission(
	resource: ResourceType,
	actions: ScopeActionType[],
): string {
	const actionString = formatActions(actions);
	const resourceName = RESOURCE_METADATA[resource].namePlural.toLowerCase();

	return `${actionString.charAt(0).toUpperCase()}${actionString.slice(1)} ${resourceName}`;
}

export function getResourceDescription(resource: ResourceType): string {
	return RESOURCE_METADATA[resource].description;
}

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

export interface GroupedPermission {
	resource: ResourceType;
	resourceName: string;
	actions: ScopeActionType[];
	formattedPermission: string;
	description: string;
}

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
