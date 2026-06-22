import {
	member,
	type Organization,
	organizations,
	type SandboxColor,
	type SandboxIcon,
} from "@autumn/shared";
import type { User } from "better-auth";
import { generateId } from "better-auth";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { provisionOrgResources } from "@/utils/authUtils/afterOrgCreated.js";

/**
 * Insert a sub-org row (created_by = master), optionally a membership, and run
 * provisioning (`provisionOrgResources`: Stripe connect account, svix apps,
 * pkeys). Shared by the platform-org create and the dashboard sandbox create;
 * slug resolution and key generation stay with the callers.
 *
 * Provisioning runs strict: a mid-way failure rolls back the external resources
 * AND the local rows inserted here, then rethrows, so nothing is orphaned.
 */
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
		// External resources are already rolled back by provisionOrgResources;
		// drop the local rows so a failed provision leaves nothing behind.
		await db.delete(member).where(eq(member.organizationId, orgId));
		await db.delete(organizations).where(eq(organizations.id, orgId));
		throw error;
	}

	// Re-read so callers (and teardown-on-failure paths) get the provisioned
	// external ids (test_stripe_connect, svix_config), not the bare inserted row.
	const provisioned = await OrgService.get({ db, orgId });
	return { ...provisioned, master: masterOrg };
};
