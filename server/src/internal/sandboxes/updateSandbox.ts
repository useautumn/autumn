import type { Organization, SandboxColor, SandboxIcon } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { getOwnedSandbox } from "./getOwnedSandbox.js";

export const updateSandboxForOrg = async ({
	db,
	masterOrg,
	sandboxId,
	updates,
}: {
	db: DrizzleCli;
	masterOrg: Organization;
	sandboxId: string;
	updates: { name?: string; color?: SandboxColor; icon?: SandboxIcon };
}): Promise<void> => {
	await getOwnedSandbox({ db, masterOrg, sandboxId });

	const orgUpdates: Partial<Organization> = {};
	if (updates.name !== undefined) {
		orgUpdates.name = updates.name;
	}
	if (updates.color !== undefined) {
		orgUpdates.sandbox_color = updates.color;
	}
	if (updates.icon !== undefined) {
		orgUpdates.sandbox_icon = updates.icon;
	}

	await OrgService.update({ db, orgId: sandboxId, updates: orgUpdates });
};
