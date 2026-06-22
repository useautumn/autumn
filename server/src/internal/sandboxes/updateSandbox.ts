import {
	ErrCode,
	type Organization,
	RecaseError,
	type SandboxColor,
	type SandboxIcon,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

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
	const target = await OrgService.get({ db, orgId: sandboxId });

	if (
		target.id === masterOrg.id ||
		target.created_by !== masterOrg.id ||
		target.is_sandbox !== true
	) {
		throw new RecaseError({
			message: "Sandbox not found",
			code: ErrCode.OrgNotFound,
			statusCode: 404,
		});
	}

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
