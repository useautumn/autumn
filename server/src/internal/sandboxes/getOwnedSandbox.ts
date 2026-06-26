import { ErrCode, type Organization, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

/**
 * Fetch a sandbox the master org owns, or throw a uniform 404. Folds "doesn't
 * exist" and "exists but isn't yours" into one message so neither leaks.
 */
export const getOwnedSandbox = async ({
	db,
	masterOrg,
	sandboxId,
}: {
	db: DrizzleCli;
	masterOrg: Organization;
	sandboxId: string;
}): Promise<Organization> => {
	const notFound = () =>
		new RecaseError({
			message: "Sandbox not found",
			code: ErrCode.OrgNotFound,
			statusCode: 404,
		});

	let target: Organization;
	try {
		target = await OrgService.get({ db, orgId: sandboxId });
	} catch (error) {
		if (error instanceof RecaseError && error.code === ErrCode.OrgNotFound) {
			throw notFound();
		}
		throw error;
	}

	if (
		target.id === masterOrg.id ||
		target.created_by !== masterOrg.id ||
		target.is_sandbox !== true
	) {
		throw notFound();
	}

	return target;
};
