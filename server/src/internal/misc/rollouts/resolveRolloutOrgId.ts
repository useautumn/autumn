import type { Organization } from "@autumn/shared";

/** The org whose rollout entry routes this org: a sandbox follows its master; platform sub-orgs keep their own. */
export const resolveRolloutOrgId = ({
	org,
}: {
	org: Pick<Organization, "id" | "is_sandbox" | "created_by">;
}): string => (org.is_sandbox && org.created_by ? org.created_by : org.id);
