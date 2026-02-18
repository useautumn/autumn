import type { AuthResult } from "../backend/core/types";

export type CustomerScope = "user" | "organization" | "user_and_organization";

/** Custom identity resolver function */
export type IdentifyFn = (context: {
	session: BetterAuthSession | null;
	organization: BetterAuthOrganization | null;
}) => AuthResult;

export type AutumnOptions = {
	/** Autumn API secret key (defaults to AUTUMN_SECRET_KEY env var) */
	secretKey?: string;
	/** Base URL for Autumn API */
	baseURL?: string;
	/** How to resolve customer identity from session */
	customerScope?: CustomerScope;
	/** Custom identity resolver (overrides customerScope) */
	identify?: IdentifyFn;
};

/** Better Auth session shape (minimal) */
export type BetterAuthSession = {
	user: {
		id: string;
		name?: string;
		email?: string;
	};
	session: {
		id: string;
		activeOrganizationId?: string | null;
	};
};

/** Better Auth organization shape (minimal) */
export type BetterAuthOrganization = {
	id: string;
	name: string;
	slug?: string;
};
