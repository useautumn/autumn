import {
	AppEnv,
	AuthType,
	ErrCode,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import type { User } from "better-auth";
import { generateId } from "better-auth";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { createKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { provisionSubOrg } from "@/internal/orgs/orgUtils/provisionSubOrg.js";
import { slugify } from "@/utils/genUtils.js";

/**
 * Sandbox creation is a dashboard action: it needs the acting user (for Stripe
 * provisioning) and is never reachable via an API key (which carries no user).
 */
export const assertDashboardActor = ({
	authType,
	user,
}: {
	authType: AuthType;
	user: User | undefined;
}): User => {
	if (authType !== AuthType.Dashboard || !user) {
		throw new RecaseError({
			message: "Sandboxes can only be created from the dashboard",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}
	return user;
};

/**
 * Sandboxes are managed from the main org. Reject if the request resolved into a
 * sandbox sub-org (via `x-sandbox-org-id`) — otherwise you'd create/list nested
 * sandboxes-of-a-sandbox.
 */
export const assertNotSandboxContext = (org: {
	is_sandbox?: boolean | null;
}): void => {
	if (org.is_sandbox) {
		throw new RecaseError({
			message:
				"Sandboxes are managed from your main organization, not from within a sandbox",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

export const createSandboxForOrg = async ({
	db,
	masterOrg,
	actorUser,
	name,
}: {
	db: DrizzleCli;
	masterOrg: Organization;
	actorUser: User;
	name: string;
}): Promise<{ org: Organization; secret_key: string }> => {
	const slug = `${slugify(name, "dash")}-${generateId()}|${masterOrg.id}`;

	const org = await provisionSubOrg({
		db,
		masterOrg,
		actorUser,
		slug,
		name,
		isSandbox: true,
		createMembership: false,
	});

	try {
		const secret_key = await createKey({
			db,
			env: AppEnv.Sandbox,
			orgId: org.id,
			userId: actorUser.id,
			name: "Sandbox API Key",
			prefix: "am_sk_test",
			meta: {},
		});

		return { org, secret_key };
	} catch (error) {
		// org is fully provisioned here (ids persisted), so the full teardown
		// cleans it up by reading the org row.
		await deletePlatformSubOrg({
			db,
			org,
			logger,
			skipLiveCustomerCheck: true,
		});
		throw error;
	}
};
