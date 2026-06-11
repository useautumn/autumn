import type { ApiSubjectV0 } from "@api/customers/apiSubjectV0";
import type { ApiBalanceV1 } from "@api/customers/cusFeatures/apiBalanceV1";
import { apiBalanceV1ToAvailableOverage } from "@api/customers/cusFeatures/utils/convert/apiBalanceV1ToAvailableOverage";
import { apiSubjectToOverageAllowedControl } from "@api/customers/utils/apiSubjectToOverageAllowed";
import { apiSubjectToUsageLimitHeadroom } from "@api/customers/utils/apiSubjectToUsageLimitHeadroom";
import type { Feature } from "@models/featureModels/featureModels";
import { isBooleanFeature, notNullish } from "@utils/index";
import { Decimal } from "decimal.js";

export type AllowedResult = {
	allowed: boolean;
	limitType?: "included" | "max_purchase" | "spend_limit" | "usage_limit";
};

export type ApiBalanceInput = {
	apiBalance: ApiBalanceV1;
	apiSubject: ApiSubjectV0;
	feature: Feature;
	requiredBalance: number;
	/** The checked feature when it differs from the evaluated one (credit
	 *  system member), so metered usage caps on it can gate the check. */
	originalFeature?: Feature;
};

export const apiBalanceToAllowed = ({
	apiBalance,
	apiSubject,
	feature,
	requiredBalance,
	originalFeature,
}: ApiBalanceInput): AllowedResult => {
	if (!apiBalance) return { allowed: false };

	if (isBooleanFeature({ feature })) return { allowed: true };

	if (apiBalance.unlimited) return { allowed: true };

	if (requiredBalance < 0) return { allowed: true };

	// Windowed usage caps gate regardless of balance or overage availability.
	const usageLimitHeadroom = apiSubjectToUsageLimitHeadroom({
		apiSubject,
		feature,
		originalFeature,
	});
	if (
		notNullish(usageLimitHeadroom) &&
		new Decimal(requiredBalance).gt(usageLimitHeadroom)
	) {
		return { allowed: false, limitType: "usage_limit" };
	}

	const overageAllowedControl = apiSubjectToOverageAllowedControl({
		subject: apiSubject,
		feature,
	});

	if (overageAllowedControl?.enabled === false) {
		if (new Decimal(apiBalance.remaining).gte(requiredBalance))
			return { allowed: true };
		return { allowed: false, limitType: "included" };
	}

	if (apiBalance.overage_allowed || overageAllowedControl?.enabled) {
		const { availableOverage, reason } = apiBalanceV1ToAvailableOverage({
			apiBalance,
			apiSubject,
			feature,
		});

		if (notNullish(availableOverage)) {
			const allowed = new Decimal(availableOverage)
				.add(apiBalance.remaining)
				.gte(requiredBalance);

			if (!allowed) return { allowed: false, limitType: reason };
			return { allowed: true };
		}

		return { allowed: true };
	}

	if (new Decimal(apiBalance.remaining).gte(requiredBalance))
		return { allowed: true };

	return { allowed: false, limitType: "included" };
};
