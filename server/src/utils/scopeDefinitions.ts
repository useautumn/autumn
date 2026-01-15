/**
 * OAuth 2.1 Scope Definitions for Autumn
 * 
 * Scopes follow the format: resource:action
 * - Resources: organisation, customers, features, plans, apiKeys
 * - Actions: create, read, update, delete, list
 */

export type ResourceType = 
	| "organisation"
	| "customers"
	| "features"
	| "plans"
	| "apiKeys";

export type ActionType = "create" | "read" | "update" | "delete" | "list";

export type ScopeString = `${ResourceType}:${ActionType}`;

/**
 * Standard OpenID Connect scopes (for compatibility)
 */
export const OPENID_SCOPES = [
	"openid",
	"profile", 
	"email",
	"offline_access"
] as const;

/**
 * Legacy scopes (for backward compatibility with existing clients)
 * @deprecated Use resource:action format instead (e.g., apiKeys:read)
 */
export const LEGACY_SCOPES = [
	"apiKeys", // Old format, maps to all apiKeys:* permissions
] as const;

/**
 * Custom resource-based scopes
 */
export const RESOURCE_SCOPES: ScopeString[] = [
	// Organisation (no list - user is already scoped to an org)
	"organisation:create",
	"organisation:read",
	"organisation:update",
	"organisation:delete",

	// Customers
	"customers:create",
	"customers:read",
	"customers:update",
	"customers:delete",
	"customers:list",

	// Features
	"features:create",
	"features:read",
	"features:update",
	"features:delete",
	"features:list",

	// Plans
	"plans:create",
	"plans:read",
	"plans:update",
	"plans:delete",
	"plans:list",

	// API Keys
	"apiKeys:create",
	"apiKeys:read",
	"apiKeys:update",
	"apiKeys:delete",
	"apiKeys:list",
];

/**
 * All valid scopes in the system (OpenID + Legacy + Resource scopes)
 */
export const ALL_SCOPES = [...OPENID_SCOPES, ...LEGACY_SCOPES, ...RESOURCE_SCOPES];

/**
 * Resource metadata for display purposes
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
		namePlural: "Organisations",
		description: "Your organization settings and information",
	},
	customers: {
		name: "Customer",
		namePlural: "Customers",
		description: "Your customer data and records",
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
	apiKeys: {
		name: "API Key",
		namePlural: "API Keys",
		description: "API keys for authentication",
	},
};

/**
 * Action metadata for display purposes
 */
export const ACTION_METADATA: Record<
	ActionType,
	{
		verb: string;
		description: string;
	}
> = {
	create: {
		verb: "Create",
		description: "Create new records",
	},
	read: {
		verb: "Read",
		description: "View existing records",
	},
	update: {
		verb: "Update",
		description: "Modify existing records",
	},
	delete: {
		verb: "Delete",
		description: "Remove records",
	},
	list: {
		verb: "List",
		description: "List and search records",
	},
};

/**
 * Parse a scope string into resource and action
 */
export function parseScope(scope: string): {
	resource: ResourceType | null;
	action: ActionType | null;
} {
	const parts = scope.split(":");
	if (parts.length !== 2) {
		return { resource: null, action: null };
	}

	const [resource, action] = parts;
	return {
		resource: resource as ResourceType,
		action: action as ActionType,
	};
}

/**
 * Group scopes by resource
 */
export function groupScopesByResource(scopes: string[]): Map<
	ResourceType,
	ActionType[]
> {
	const grouped = new Map<ResourceType, ActionType[]>();

	for (const scope of scopes) {
		const { resource, action } = parseScope(scope);
		if (!resource || !action) continue;

		const existingActions = grouped.get(resource) || [];
		if (!existingActions.includes(action)) {
			existingActions.push(action);
		}
		grouped.set(resource, existingActions);
	}

	return grouped;
}

/**
 * Format actions into a human-readable string
 * Examples:
 * - ["read"] -> "Read"
 * - ["read", "update"] -> "Read and update"
 * - ["read", "update", "delete"] -> "Read, update, and delete"
 */
export function formatActions(actions: ActionType[]): string {
	if (actions.length === 0) return "";
	if (actions.length === 1) return ACTION_METADATA[actions[0]].verb;

	const verbs = actions.map((action) => ACTION_METADATA[action].verb.toLowerCase());

	if (actions.length === 2) {
		return `${verbs[0]} and ${verbs[1]}`;
	}

	const lastVerb = verbs.pop();
	return `${verbs.join(", ")}, and ${lastVerb}`;
}

/**
 * Format a resource with actions into a human-readable description
 * Examples:
 * - (customers, ["read"]) -> "Read customers"
 * - (plans, ["read", "update"]) -> "Read and update plans"
 * - (apiKeys, ["create", "read", "delete"]) -> "Create, read, and delete API keys"
 */
export function formatResourcePermission(
	resource: ResourceType,
	actions: ActionType[]
): string {
	const actionString = formatActions(actions);
	const resourceName = RESOURCE_METADATA[resource].namePlural.toLowerCase();

	// Capitalize first letter
	return actionString.charAt(0).toUpperCase() + actionString.slice(1) + " " + resourceName;
}

/**
 * Check if a scope is valid
 */
export function isValidScope(scope: string): scope is ScopeString {
	return ALL_SCOPES.includes(scope as ScopeString);
}

/**
 * Validate an array of scopes
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
