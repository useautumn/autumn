import {
	AppEnv,
	AuthType,
	DEFAULT_SANDBOX_COLOR,
	DEFAULT_SANDBOX_ICON,
	ErrCode,
	type Organization,
	RecaseError,
	type SandboxColor,
	type SandboxIcon,
	sandboxSlug,
	validateSandboxName,
} from "@autumn/shared";
import { Autumn } from "autumn-js";
import type { User } from "better-auth";
import { generateId } from "better-auth";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { createKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { provisionSubOrg } from "@/internal/orgs/orgUtils/provisionSubOrg.js";

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

const MAX_SANDBOXES_FEATURE_ID = "max_sandboxes";

type SandboxCapacityCheck = (args: {
	customerId: string;
	requiredBalance: number;
}) => Promise<{ allowed?: boolean }>;

const defaultSandboxCapacityCheck: SandboxCapacityCheck = async ({
	customerId,
	requiredBalance,
}) => {
	if (!process.env.AUTUMN_SECRET_KEY) {
		return { allowed: true };
	}
	try {
		const autumn = new Autumn();
		const { allowed } = await autumn.check({
			customerId,
			featureId: MAX_SANDBOXES_FEATURE_ID,
			requiredBalance,
		});
		return { allowed };
	} catch {
		return { allowed: true };
	}
};

export const assertSandboxCapacity = async ({
	db,
	masterOrgId,
	checkCapacity = defaultSandboxCapacityCheck,
	existing,
}: {
	db: DrizzleCli;
	masterOrgId: string;
	checkCapacity?: SandboxCapacityCheck;
	existing?: Awaited<ReturnType<typeof OrgService.listSandboxes>>;
}): Promise<void> => {
	const sandboxes =
		existing ?? (await OrgService.listSandboxes({ db, masterOrgId }));
	const { allowed } = await checkCapacity({
		customerId: masterOrgId,
		requiredBalance: sandboxes.length + 1,
	});
	if (allowed === false) {
		throw new RecaseError({
			message: "You've reached your sandbox limit. Contact us to raise it.",
			code: ErrCode.FeatureLimitReached,
			statusCode: 403,
		});
	}
};

export const assertSandboxNameUnique = async ({
	db,
	masterOrgId,
	name,
	excludeOrgId,
	existing,
}: {
	db: DrizzleCli;
	masterOrgId: string;
	name: string;
	excludeOrgId?: string;
	existing?: Awaited<ReturnType<typeof OrgService.listSandboxes>>;
}): Promise<void> => {
	const slug = sandboxSlug(name);
	const sandboxes =
		existing ?? (await OrgService.listSandboxes({ db, masterOrgId }));
	const taken = sandboxes.some(
		(sandbox) =>
			sandbox.id !== excludeOrgId && sandboxSlug(sandbox.name) === slug,
	);
	if (taken) {
		throw new RecaseError({
			message: `A sandbox named "${name}" already exists`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

export const assertSandboxNameValid = ({ name }: { name: string }): void => {
	const error = validateSandboxName(name);
	if (error) {
		throw new RecaseError({
			message: error,
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
	color,
	icon,
}: {
	db: DrizzleCli;
	masterOrg: Organization;
	actorUser: User;
	name: string;
	color?: SandboxColor;
	icon?: SandboxIcon;
}): Promise<{ org: Organization; secret_key: string }> => {
	assertSandboxNameValid({ name });
	const existing = await OrgService.listSandboxes({
		db,
		masterOrgId: masterOrg.id,
	});
	await assertSandboxCapacity({ db, masterOrgId: masterOrg.id, existing });
	await assertSandboxNameUnique({
		db,
		masterOrgId: masterOrg.id,
		name,
		existing,
	});

	const slug = `${sandboxSlug(name)}-${generateId()}|${masterOrg.id}`;

	const org = await provisionSubOrg({
		db,
		masterOrg,
		actorUser,
		slug,
		name,
		isSandbox: true,
		createMembership: false,
		sandboxColor: color ?? DEFAULT_SANDBOX_COLOR,
		sandboxIcon: icon ?? DEFAULT_SANDBOX_ICON,
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
