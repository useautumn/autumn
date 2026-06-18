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
	sandboxOrgId,
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
	const { allowed } = checkScopes([Scopes.Platform.Write], scopes);
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

	if (!candidate) {
		throw new RecaseError({
			message: `Sandbox ${sandboxOrgId} not found`,
			code: ErrCode.OrgNotFound,
			statusCode: 404,
		});
	}

	if (candidate.id === sessionOrgId) {
		throw new RecaseError({
			message: "Active organization is not a sandbox",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (!candidate.created_by || candidate.created_by !== sessionOrgId) {
		throw new RecaseError({
			message: "Sandbox does not belong to this organization",
			code: ErrCode.InvalidRequest,
			statusCode: 403,
		});
	}

	// preview + reseller sub-orgs also carry created_by, so created_by isn't enough
	if (candidate.is_sandbox !== true) {
		throw new RecaseError({
			message: "Target organization is not a sandbox",
			code: ErrCode.InvalidRequest,
			statusCode: 403,
		});
	}
};
