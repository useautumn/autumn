import { organizations } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { shadowAtomConfigStore } from "../shadowAtomConfigStore.js";

/** Name and slug for every org registered on the shadow Atom. */
export const findShadowAtomNames = async ({ db }: { db: DrizzleCli }) => {
	const orgIds = Object.keys(
		(await shadowAtomConfigStore.readFromSource()).orgs,
	);
	const orgs =
		orgIds.length > 0
			? await db
					.select({
						id: organizations.id,
						name: organizations.name,
						slug: organizations.slug,
					})
					.from(organizations)
					.where(inArray(organizations.id, orgIds))
			: [];
	return { orgsById: Object.fromEntries(orgs.map((org) => [org.id, org])) };
};
