import type { MeteringShadowConfig } from "@/internal/misc/meteringShadow/meteringShadowSchemas.js";
import { getMeteringShadowConfig } from "@/internal/misc/meteringShadow/meteringShadowStore.js";

export type ShadowTapEnablement = {
	enabled: boolean;
	/** `null` means every org is mirrored. */
	allowedOrgIds: Set<string> | null;
};

export type ShadowTapConfig = {
	brokers: string[];
	topic: string;
	region: string;
	clientId: string;
	/** Called on every deduction, so it must stay synchronous and never throw:
	 *  it reads the edge config store's polled in-memory value. */
	readEnablement: () => ShadowTapEnablement;
};

const ALL_ORGS = "*";
const DEFAULT_TOPIC = "metering-events-v1";

const splitList = ({ value }: { value: string | undefined }): string[] =>
	(value ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);

export const toShadowTapEnablement = ({
	config,
}: {
	config: MeteringShadowConfig;
}): ShadowTapEnablement => {
	const orgIds = config.orgs
		.map((orgId) => orgId.trim())
		.filter((orgId) => orgId.length > 0);
	const everyOrg = orgIds.length === 0 || orgIds.includes(ALL_ORGS);

	return {
		enabled: config.enabled,
		allowedOrgIds: everyOrg ? null : new Set(orgIds),
	};
};

/**
 * Returns `null` when the deploy has no Kafka wired up at all, which the caller
 * treats as "never mirror anything". Whether the tap actually mirrors is the
 * `metering-shadow` edge config's call, re-read on every deduction, so the
 * toggle takes effect without a redeploy.
 */
export const readShadowTapConfig = ({
	env = process.env,
	readConfig = getMeteringShadowConfig,
}: {
	env?: Record<string, string | undefined>;
	readConfig?: () => MeteringShadowConfig;
} = {}): ShadowTapConfig | null => {
	const brokers = splitList({ value: env.KAFKA_BOOTSTRAP });
	if (brokers.length === 0) return null;

	return {
		brokers,
		topic: env.EVENTS_TOPIC?.trim() || DEFAULT_TOPIC,
		region: env.AWS_REGION ?? "us-east-1",
		clientId: `autumn-metering-shadow-tap-${env.ENV_NAME ?? "unknown"}`,
		readEnablement: () => toShadowTapEnablement({ config: readConfig() }),
	};
};

export const isOrgTapped = ({
	enablement,
	orgId,
}: {
	enablement: ShadowTapEnablement;
	orgId: string;
}): boolean =>
	enablement.allowedOrgIds === null || enablement.allowedOrgIds.has(orgId);
