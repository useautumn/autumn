import { type Organization, organizations, RecaseError } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getConnectedOrgSlug } from "./platformUtils.js";

/**
 * Validates that a platform organization exists and is owned by the master org
 * @returns The organization if valid
 * @throws RecaseError if org not found or not owned by master
 */
export const validatePlatformOrg = async ({
	db,
	organizationSlug,
	masterOrg,
}: {
	db: DrizzleCli;
	organizationSlug: string;
	masterOrg: Organization;
}): Promise<Organization> => {
	const orgSlug = getConnectedOrgSlug({
		orgSlug: organizationSlug,
		masterOrgId: masterOrg.id,
	});

	const [org] = await db
		.select()
		.from(organizations)
		.where(
			and(
				eq(organizations.slug, orgSlug),
				eq(organizations.created_by, masterOrg.id),
			),
		)
		.limit(1);

	if (!org) {
		throw new RecaseError({
			message: `Organization with slug '${organizationSlug}' not found`,
		});
	}

	if (org.created_by !== masterOrg.id) {
		throw new RecaseError({
			message: "You do not have permission to manage this organization",
		});
	}

	return org;
};
