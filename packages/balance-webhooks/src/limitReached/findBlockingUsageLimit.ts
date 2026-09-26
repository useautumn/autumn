import type { CheckCommand, WorkerFullSubject } from "@autumn/balance-engine";
import {
	type BalancesLimitReached,
	fullSubjectToUsageWindowLimits,
	getCurrentUsageWindowUsage,
	orgToInStatuses,
	subtractSafe,
	usageLimitFilterMatchesProperties,
	usageWindowLimitToWebhookBlock,
} from "@autumn/shared";
import { fullSubjectToUsageWindowFeatures } from "../common/convertSubject/fullSubjectToUsageWindowFeatures.js";

type BlockingUsageLimit = Pick<BalancesLimitReached, "filter" | "usage_limit">;

/** Enforcement stops at the cap with the least headroom; that one is reported, filter included: prod's rule, on the worker's rows. */
export const findBlockingUsageLimit = ({
	command,
	fullSubject,
}: {
	command: CheckCommand;
	fullSubject: WorkerFullSubject;
}): BlockingUsageLimit | null => {
	const now = command.occurredAt;
	const features = fullSubjectToUsageWindowFeatures({
		fullSubject,
		featureId: command.featureId,
		internalFeatureId: command.internalFeatureId,
		now,
	});
	const measured = fullSubjectToUsageWindowLimits({
		fullSubject,
		featureIds: [command.featureId],
		features,
		now,
		inStatuses: orgToInStatuses({ org: command.org }),
	})
		.filter((limit) =>
			usageLimitFilterMatchesProperties({
				filterProperties: limit.filter_properties,
				eventProperties: command.properties ?? undefined,
			}),
		)
		.flatMap((limit) => {
			const usage = getCurrentUsageWindowUsage({
				usageWindows: fullSubject.usage_windows,
				limit,
				now,
			});
			const block = usageWindowLimitToWebhookBlock({ limit, usage });
			if (!block) return [];
			const headroom = subtractSafe({ left: limit.limit, right: usage });
			return [{ limit, block, headroom }];
		})
		.sort((left, right) => left.headroom - right.headroom);

	const tightest = measured[0];
	if (!tightest || tightest.headroom > 0) return null;

	return {
		usage_limit: tightest.block,
		...(tightest.limit.filter_properties
			? { filter: { properties: tightest.limit.filter_properties } }
			: {}),
	};
};
