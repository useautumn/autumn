import {
	REPLAY_STAGING_BROKERS,
	REPLAY_STAGING_DEPLOYMENT,
	REPLAY_STAGING_OWNERSHIP_TOPIC,
	REPLAY_STAGING_PARTITION_COUNT,
	REPLAY_STAGING_REGION,
	ReplayStagingTargetError,
	type ReplayStagingTargetInput,
	type ReplayStagingTargetPolicy,
	type ReplayTargetValidationIssue,
	replayStagingTargetInputSchema,
	replayStagingTargetPolicySchema,
	type ValidatedReplayStagingTarget,
} from "./replayStagingTargetContracts.js";
import { validateReplayDatabaseUrl } from "./validateReplayDatabaseUrl.js";

const REPLAY_STAGING_BROKER_SET: ReadonlySet<string> = new Set(
	REPLAY_STAGING_BROKERS,
);

const describeTargetIssues = ({
	issues,
}: {
	issues: readonly ReplayTargetValidationIssue[];
}): string => {
	const descriptions: string[] = [];
	for (const issue of issues) {
		const path = issue.path.map(String).join(".");
		descriptions.push(
			path.length > 0 ? `${path}: ${issue.message}` : issue.message,
		);
	}
	return descriptions.join("; ");
};

const parseTargetInput = ({
	target,
}: {
	target: unknown;
}): ReplayStagingTargetInput => {
	const result = replayStagingTargetInputSchema.safeParse(target);
	if (!result.success) {
		throw new ReplayStagingTargetError({
			message: `invalid replay staging target: ${describeTargetIssues({
				issues: result.error.issues,
			})}`,
		});
	}
	return result.data;
};

const parseTargetPolicy = ({
	policy,
}: {
	policy: unknown;
}): ReplayStagingTargetPolicy => {
	const result = replayStagingTargetPolicySchema.safeParse(policy);
	if (!result.success) {
		throw new ReplayStagingTargetError({
			message: `invalid trusted replay target policy: ${describeTargetIssues({
				issues: result.error.issues,
			})}`,
		});
	}
	return result.data;
};

const assertPinnedBrokers = ({
	brokers,
}: {
	brokers: readonly string[];
}): void => {
	const seenBrokers = new Set<string>();
	for (const broker of brokers) {
		if (!REPLAY_STAGING_BROKER_SET.has(broker)) {
			throw new ReplayStagingTargetError({
				message: `replay target broker "${broker}" is not part of the pinned staging cluster`,
			});
		}
		if (seenBrokers.has(broker)) {
			throw new ReplayStagingTargetError({
				message: `replay target broker "${broker}" is listed more than once`,
			});
		}
		seenBrokers.add(broker);
	}
	if (seenBrokers.size !== REPLAY_STAGING_BROKERS.length) {
		throw new ReplayStagingTargetError({
			message: `replay target must list all ${REPLAY_STAGING_BROKERS.length} pinned staging brokers`,
		});
	}
};

const assertPinnedField = ({
	field,
	actual,
	expected,
}: {
	field: string;
	actual: string | number;
	expected: string | number;
}): void => {
	if (actual !== expected) {
		throw new ReplayStagingTargetError({
			message: `replay target ${field} "${actual}" does not match the pinned staging ${field} "${expected}"`,
		});
	}
};

/**
 * Proves that a replay target matches the pinned staging deployment and the
 * separately supplied trusted operator policy. Matching the policy is not proof
 * that the policy itself addresses staging infrastructure, and this guard is
 * not authorization to run a replay: the operator must still verify the policy
 * against the staging inventory before execution.
 */
export const validateReplayStagingTarget = ({
	target,
	policy,
}: {
	target: unknown;
	policy: unknown;
}): ValidatedReplayStagingTarget => {
	const parsedTarget = parseTargetInput({ target });
	const parsedPolicy = parseTargetPolicy({ policy });
	assertPinnedBrokers({ brokers: parsedTarget.brokers });
	assertPinnedField({
		field: "deployment",
		actual: parsedTarget.deployment,
		expected: REPLAY_STAGING_DEPLOYMENT,
	});
	assertPinnedField({
		field: "ownership topic",
		actual: parsedTarget.topic,
		expected: REPLAY_STAGING_OWNERSHIP_TOPIC,
	});
	assertPinnedField({
		field: "partition count",
		actual: parsedTarget.partitionCount,
		expected: REPLAY_STAGING_PARTITION_COUNT,
	});
	assertPinnedField({
		field: "region",
		actual: parsedTarget.region,
		expected: REPLAY_STAGING_REGION,
	});
	const database = validateReplayDatabaseUrl({
		databaseUrl: parsedTarget.databaseUrl,
		policy: parsedPolicy.database,
	});
	return Object.freeze({
		deployment: REPLAY_STAGING_DEPLOYMENT,
		topic: REPLAY_STAGING_OWNERSHIP_TOPIC,
		partitionCount: REPLAY_STAGING_PARTITION_COUNT,
		region: REPLAY_STAGING_REGION,
		brokers: REPLAY_STAGING_BROKERS,
		database,
	});
};
