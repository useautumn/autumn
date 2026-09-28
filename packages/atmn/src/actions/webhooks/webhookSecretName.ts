/** `-` reads as `_`, so the lint refuses two ids that collide once uppercased. */
const envNameSegment = (value: string): string =>
	value.toUpperCase().replace(/-/g, "_");

/**
 * Prod: `AUTUMN_WEBHOOK_<ID>_SECRET`. A sandbox adds the first four characters
 * of its org id after `org_`, so every sandbox's secret can sit in one `.env`.
 */
export const webhookSecretName = ({
	id,
	orgId,
}: {
	id: string;
	/** Absent for prod. */
	orgId?: string;
}): string => {
	const org4 =
		orgId === undefined
			? ""
			: `_${envNameSegment(orgId.replace(/^org_/, "").slice(0, 4))}`;
	return `AUTUMN_WEBHOOK_${envNameSegment(id)}${org4}_SECRET`;
};
