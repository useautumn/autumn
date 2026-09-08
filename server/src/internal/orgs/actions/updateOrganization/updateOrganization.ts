import {
	ORG_SETTING_KEYS,
	type OrgConfig,
	type OrgSettingsParams,
	organizations,
} from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { clearOrgCache } from "../../orgUtils/clearOrgCache.js";
import { currentValueOf } from "./computeOrgSettingChanges.js";

/** Every settable flag as the org holds it, defaults filled, read as the
 * runtime reads it (the overdue twins collapse to one flag). */
export const orgSettingsOf = ({
	config,
}: {
	config: OrgConfig;
}): Required<OrgSettingsParams> =>
	Object.fromEntries(
		ORG_SETTING_KEYS.map((key) => [key, currentValueOf({ config, key })]),
	) as Required<OrgSettingsParams>;

/**
 * Writes only the flags stated, merged into the jsonb column, so an omitted
 * flag keeps whatever it held. Mirrors `include_past_due` the way the
 * dashboard's PATCH does, since readers still consult the deprecated twin.
 */
export const updateOrganization = async ({
	ctx,
	stated,
}: {
	ctx: AutumnContext;
	stated: OrgSettingsParams;
}): Promise<{ config: Required<OrgSettingsParams> }> => {
	const { db, org } = ctx;
	const updates: Partial<OrgConfig> = Object.fromEntries(
		Object.entries(stated).filter(([, value]) => value !== undefined),
	);
	if (updates.block_overdue_entitlements !== undefined) {
		updates.include_past_due = !updates.block_overdue_entitlements;
	}
	if (Object.keys(updates).length === 0) {
		return { config: orgSettingsOf({ config: org.config }) };
	}

	const [row] = await db
		.update(organizations)
		.set({
			config: sql`COALESCE(config, '{}'::jsonb) || ${JSON.stringify(updates)}::jsonb`,
		})
		.where(eq(organizations.id, org.id))
		.returning({ config: organizations.config });

	await clearOrgCache({ db, orgId: org.id });

	return { config: orgSettingsOf({ config: row?.config ?? org.config }) };
};
