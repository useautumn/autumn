/**
 * OAuth 2.1 Scope Definitions for Autumn (Frontend)
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
		order: number; // For sorting
	}
> = {
	create: {
		verb: "Create",
		description: "Create new records",
		order: 1,
	},
	read: {
		verb: "Read",
		description: "View existing records",
		order: 2,
	},
	list: {
		verb: "List",
		description: "List and search records",
		order: 3,
	},
	update: {
		verb: "Update",
		description: "Modify existing records",
		order: 4,
	},
	delete: {
		verb: "Delete",
		description: "Remove records",
		order: 5,
	},
};

/**
 * Standard OpenID Connect scopes
 */
const OPENID_SCOPES = ["openid", "profile", "email", "offline_access"];

/**
 * Check if a scope is an OpenID scope (not a resource scope)
 */
export function isOpenIdScope(scope: string): boolean {
	return OPENID_SCOPES.includes(scope);
}

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
 * Group scopes by resource (filters out OpenID scopes)
 */
export function groupScopesByResource(scopes: string[]): Map<
	ResourceType,
	ActionType[]
> {
	const grouped = new Map<ResourceType, ActionType[]>();

	for (const scope of scopes) {
		// Skip OpenID scopes - they're not resource-based
		if (isOpenIdScope(scope)) continue;

		const { resource, action } = parseScope(scope);
		if (!resource || !action) continue;

		const existingActions = grouped.get(resource) || [];
		if (!existingActions.includes(action)) {
			existingActions.push(action);
		}
		grouped.set(resource, existingActions);
	}

	// Sort actions by their order
	for (const [resource, actions] of grouped.entries()) {
		actions.sort((a, b) => ACTION_METADATA[a].order - ACTION_METADATA[b].order);
		grouped.set(resource, actions);
	}

	return grouped;
}

/**
 * Format actions into a human-readable string
 * Examples:
 * - ["read"] -> "Read"
 * - ["read", "update"] -> "Read and update"
 * - ["create", "read", "update"] -> "Create, read, and update"
 * - ["create", "read", "update", "delete"] -> "Create, read, update, and delete"
 */
export function formatActions(actions: ActionType[]): string {
	if (actions.length === 0) return "";
	if (actions.length === 1) return ACTION_METADATA[actions[0]].verb;

	// Sort actions by their order
	const sortedActions = [...actions].sort(
		(a, b) => ACTION_METADATA[a].order - ACTION_METADATA[b].order
	);

	const verbs = sortedActions.map((action) => ACTION_METADATA[action].verb.toLowerCase());

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
 * Get a description for a resource
 */
export function getResourceDescription(resource: ResourceType): string {
	return RESOURCE_METADATA[resource].description;
}

/**
 * Group and format scopes for display
 * Returns an array of objects with resource name and formatted permission string
 */
export interface GroupedPermission {
	resource: ResourceType;
	resourceName: string;
	actions: ActionType[];
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
