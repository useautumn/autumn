import { clearOrgWithFeaturesCache } from "@autumn/cache";
import {
	member,
	type Organization,
	type OrgConfig,
	organizations,
	type SandboxColor,
	type SandboxIcon,
} from "@autumn/shared";
import type { User } from "better-auth";
import { generateId } from "better-auth";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getMiscCacheContext } from "@/external/redis/miscCache/getMiscCacheContext.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { provisionOrgResources } from "@/utils/authUtils/afterOrgCreated.js";

export const provisionSubOrg = async ({
	db,
	masterOrg,
	actorUser,
	slug,
	name,
	isSandbox,
	createMembership,
	sandboxColor,
	sandboxIcon,
	config,
}: {
	db: DrizzleCli;
	masterOrg: Organization;
	actorUser: User;
	slug: string;
	name: string;
	isSandbox: boolean;
	createMembership: boolean;
	sandboxColor?: SandboxColor;
	sandboxIcon?: SandboxIcon;
	config?: OrgConfig;
}): Promise<Organization & { master?: Organization | null }> => {
	const orgId = generateId();
	const [insertedOrg] = await db
		.insert(organizations)
		.values({
			id: orgId,
			slug,
			name,
			logo: "",
			createdAt: new Date(),
			metadata: "",
			created_by: masterOrg.id,
			is_sandbox: isSandbox,
			sandbox_color: sandboxColor ?? null,
			sandbox_icon: sandboxIcon ?? null,
			config,
		})
		.returning();

	const org = { ...insertedOrg, master: masterOrg };

	try {
		if (createMembership) {
			await db.insert(member).values({
				id: generateId(),
				organizationId: orgId,
				userId: actorUser.id,
				role: "owner",
				createdAt: new Date(),
			});
		}

		await provisionOrgResources({ org, user: actorUser, strict: true });
	} catch (error) {
		await db.delete(member).where(eq(member.organizationId, orgId));
		await db.delete(organizations).where(eq(organizations.id, orgId));
		await clearOrgWithFeaturesCache({ ctx: getMiscCacheContext(), orgId });
		throw error;
	}

	const provisioned = await OrgService.get({ db, orgId });
	return { ...provisioned, master: masterOrg };
};
