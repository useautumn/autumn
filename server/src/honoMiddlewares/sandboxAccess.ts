import {
	AppEnv,
	checkScopes,
	ErrCode,
	RecaseError,
	Scopes,
} from "@autumn/shared";

export const SANDBOX_ORG_HEADER = "x-sandbox-org-id";

export type SandboxCandidateOrg = {
	id: string;
	created_by?: string | null;
	is_sandbox?: boolean | null;
};

export const assertSandboxAccess = ({
	sessionOrgId,
	candidate,
	appEnv,
	scopes,
}: {
	sessionOrgId: string;
	sandboxOrgId: string;
	candidate: SandboxCandidateOrg | null | undefined;
	appEnv: AppEnv | string | undefined;
	scopes: readonly string[];
}): void => {
	const { allowed } = checkScopes([Scopes.Organisation.Read], scopes);
	if (!allowed) {
		throw new RecaseError({
			message: "Not authorized to access sandbox environments",
			code: ErrCode.InsufficientScopes,
			statusCode: 403,
		});
	}

	if (appEnv === AppEnv.Live) {
		throw new RecaseError({
			message: "Sandbox environments cannot be accessed with app_env=live",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// Uniform 404 for every target-resolution failure (missing, your own org,
	// not yours, not a sandbox) so the response can't probe ids or ownership.
	// preview + reseller sub-orgs also carry created_by, so created_by isn't enough.
	if (
		!candidate ||
		candidate.id === sessionOrgId ||
		candidate.created_by !== sessionOrgId ||
		candidate.is_sandbox !== true
	) {
		throw new RecaseError({
			message: "Sandbox not found",
			code: ErrCode.OrgNotFound,
			statusCode: 404,
		});
	}
};
