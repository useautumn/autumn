export type ShadowTapConfig = {
	brokers: string[];
	topic: string;
	region: string;
	clientId: string;
	/** `null` means every org is mirrored. */
	allowedOrgIds: Set<string> | null;
};

const ALL_ORGS = "*";

const splitList = ({ value }: { value: string | undefined }): string[] =>
	(value ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);

const parseAllowedOrgIds = ({
	value,
}: {
	value: string | undefined;
}): Set<string> | null => {
	const orgIds = splitList({ value });
	if (orgIds.length === 0 || orgIds.includes(ALL_ORGS)) return null;
	return new Set(orgIds);
};

/** Returns `null` whenever the tap must stay off. The caller treats that as
 *  "never mirror anything", so an unconfigured deploy costs nothing. */
export const readShadowTapConfig = ({
	env = process.env,
}: {
	env?: Record<string, string | undefined>;
} = {}): ShadowTapConfig | null => {
	if (env.METERING_SHADOW_ENABLED !== "true") return null;

	const brokers = splitList({ value: env.KAFKA_BOOTSTRAP });
	const topic = env.EVENTS_TOPIC?.trim() ?? "";
	if (brokers.length === 0 || topic.length === 0) return null;

	return {
		brokers,
		topic,
		region: env.AWS_REGION ?? "us-east-1",
		clientId: `autumn-metering-shadow-tap-${env.ENV_NAME ?? "unknown"}`,
		allowedOrgIds: parseAllowedOrgIds({ value: env.METERING_SHADOW_ORGS }),
	};
};

export const isOrgTapped = ({
	config,
	orgId,
}: {
	config: ShadowTapConfig;
	orgId: string;
}): boolean => config.allowedOrgIds === null || config.allowedOrgIds.has(orgId);
