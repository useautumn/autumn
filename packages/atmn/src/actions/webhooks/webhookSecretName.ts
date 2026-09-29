/** `-` reads as `_`, so the lint refuses two ids that collide once uppercased. */
const envNameSegment = (value: string): string =>
	value.toUpperCase().replace(/-/g, "_");

/** A sandbox slug as an env-var segment: every non-alphanumeric run becomes `_`. */
const envKeySegment = (envKey: string): string =>
	envKey.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

/**
 * Prod: `AUTUMN_WEBHOOK_<ID>_SECRET`. A sandbox adds its `url` key (`SANDBOX`,
 * or its slug), so every sandbox's secret can sit in one `.env`.
 */
export const webhookSecretName = ({
	id,
	envKey,
}: {
	id: string;
	/** Absent for prod. */
	envKey?: string;
}): string => {
	const suffix = envKey === undefined ? "" : `_${envKeySegment(envKey)}`;
	return `AUTUMN_WEBHOOK_${envNameSegment(id)}${suffix}_SECRET`;
};
