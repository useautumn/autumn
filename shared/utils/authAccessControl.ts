/**
 * Better-auth AccessControl configuration for the organization plugin.
 *
 * This gates better-auth's OWN built-in org endpoints (invite-member,
 * update-member-role, cancel-invitation, etc.). It is ORTHOGONAL to our
 * product scope system in `scopeDefinitions.ts` — scopes gate product
 * routes via `scopeCheckMiddleware`; AC gates better-auth's internal
 * SDK endpoints.
 *
 * Role permissions (for better-auth's own endpoints):
 *   - owner     → full access (stock)
 *   - admin     → full access except org delete (stock)
 *   - developer → no member/invitation management; read-only AC
 *   - sales     → no member/invitation management; read-only AC
 *   - member    → same as stock better-auth "member" (basically nothing)
 *
 * This file is shared between server (`server/src/utils/auth.ts`) and
 * client (`vite/src/lib/auth-client.ts`) so TypeScript inference on
 * `authClient.organization.inviteMember({ role })` includes our custom
 * role names.
 */

import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";

export const ac = createAccessControl(defaultStatements);

/**
 * Developer role: zero permissions on better-auth's internal org
 * endpoints. Developers cannot invite, update, or remove members via
 * better-auth's SDK. Product-level operations (creating API keys,
 * pushing plans etc.) are governed by our own scope system.
 */
export const developerRole = ac.newRole({
	organization: [],
	member: [],
	invitation: [],
	team: [],
	ac: ["read"],
});

/**
 * Sales role: same as developer for AC purposes. No better-auth org
 * management permissions.
 */
export const salesRole = ac.newRole({
	organization: [],
	member: [],
	invitation: [],
	team: [],
	ac: ["read"],
});

/**
 * All roles, keyed by role name. The stock `owner`, `admin`, and
 * `member` are re-exported from better-auth so we have a single
 * source of truth when configuring the plugin.
 */
export const roles = {
	owner: ownerAc,
	admin: adminAc,
	developer: developerRole,
	sales: salesRole,
	member: memberAc,
} as const;
