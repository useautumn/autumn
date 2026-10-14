import type { Organization } from "@autumn/shared";

export const resolveRolloutOrgId = ({
	org,
}: {
	org: Pick<Organization, "id" | "is_sandbox" | "created_by">;
}): string => (org.is_sandbox && org.created_by ? org.created_by : org.id);
