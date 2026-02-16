import type { getSessionFromCtx } from "better-auth/api";
import type { Organization } from "better-auth/plugins";
import type { AuthResult } from "../AuthFunction";

// Get return type of getSessionFromCtx
export type Session = ReturnType<typeof getSessionFromCtx>;

export type AutumnOptions = {
	baseURL?: string;
	secretKey?: string;
	// enableOrganizations?: boolean;
	customerScope?: "user" | "organization" | "user_and_organization";
	identify?: (options: {
		session: Session;
		organization?: (Organization & { ownerEmail: string | null }) | null;
	}) => AuthResult;
};
