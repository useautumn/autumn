import type { Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { getOwnedSandbox } from "./getOwnedSandbox.js";

export const deleteSandboxForOrg = async ({
	db,
	masterOrg,
	sandboxId,
	logger,
}: {
	db: DrizzleCli;
	masterOrg: Organization;
	sandboxId: string;
	logger: Logger;
}): Promise<void> => {
	const target = await getOwnedSandbox({ db, masterOrg, sandboxId });

	await deletePlatformSubOrg({ db, org: target, logger });
};
