import { type AppEnv, organizations } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { findRolloutCustomerNames } from "@/internal/admin/rollouts/findRolloutCustomerNames.js";
import { shadowAtomConfigStore } from "../shadowAtomConfigStore.js";

/** Names for every org and pinned customer the env's shadow Atom config holds by id. */
export const findShadowAtomNames = async ({
	db,
	env,
}: {
	db: DrizzleCli;
	env: AppEnv;
}) => {
	const { rollout, orgs: registered } = (
		await shadowAtomConfigStore.readFromSource()
	)[env];
	const orgIds = [
		...new Set([
			...Object.keys(rollout.orgs),
			...Object.keys(rollout.customers),
			...Object.keys(registered),
		]),
	];
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
	return {
		orgsById: Object.fromEntries(orgs.map((org) => [org.id, org])),
		customerNamesByOrgId: await findRolloutCustomerNames({
			db,
			customersByOrgId: rollout.customers,
		}),
	};
};
