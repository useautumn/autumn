import { expect, test } from "bun:test";
import {
	createSubjectState,
	subjectStateToFullSubject,
	type WorkerFullSubject,
	type WorkerUsageWindow,
} from "@autumn/balance-engine";
import {
	type DbUsageAlert,
	EntInterval,
	FeatureType,
	getUsageWindowBounds,
	ResetInterval,
} from "@autumn/shared";
import { customerWith } from "../../../balance-engine/tests/unit/deduction/deductionFixtures.js";
import {
	createCatalogFor,
	createCheckCommand,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	occurredAt,
} from "../../../balance-engine/tests/unit/engineFixtures.js";
import { findBlockingUsageLimit } from "../../src/limitReached/findBlockingUsageLimit.js";
import { measureUsageLimitAlert } from "../../src/usageAlerts/measure/measureUsageLimitBasis.js";

/** A daily cap of 5 on messages, which the subject holds no row of: only a `credits` pool pays for them. */

const CAP = 5;
const today = getUsageWindowBounds({
	interval: EntInterval.Day,
	now: occurredAt,
});

const messagesWindow = ({ usage }: { usage: number }): WorkerUsageWindow => ({
	id: "uw_messages",
	internal_customer_id: "cus_1",
	internal_entity_id: null,
	feature_id: "messages",
	internal_feature_id: "feat_messages",
	filter_key: null,
	anchor_customer_entitlement_id: null,
	window_start_at: today.windowStartAt,
	window_end_at: today.windowEndAt,
	usage,
	updated_at: occurredAt - 1,
});

const creditFundedSubject = ({
	messagesUsed,
}: {
	messagesUsed: number;
}): WorkerFullSubject => {
	const state = createSubjectState({
		identity,
		customer: customerWith({
			usage_limits: [
				{
					feature_id: "messages",
					enabled: true,
					limit: CAP,
					interval: ResetInterval.Day,
				},
			],
		}),
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [
			createCustomerEntitlement({
				id: "credits_row",
				featureId: "credits",
				balance: 100,
			}),
		],
		usageWindows: [messagesWindow({ usage: messagesUsed })],
	});
	const catalog = createCatalogFor({ state });
	const credits = catalog.features.feat_credits;
	if (!credits) throw new Error("credits feature row missing");
	credits.type = FeatureType.CreditSystem;
	credits.config = {
		schema: [
			{ metered_feature_id: "messages", feature_amount: 1, credit_amount: 0.2 },
		],
	};
	return subjectStateToFullSubject({ state, catalog });
};

/** The messages catalog row, off a subject that does hold one. */
const messagesFeature = () => {
	const state = createSubjectState({
		identity,
		customerEntitlements: [createCustomerEntitlement()],
	});
	const feature = createCatalogFor({ state }).features.feat_messages;
	if (!feature) throw new Error("messages feature row missing");
	return feature;
};

test.concurrent(
	"a spent cap on a feature funded only by credits is named as the blocking limit",
	() => {
		const blocking = findBlockingUsageLimit({
			command: createCheckCommand({ featureId: "messages" }),
			fullSubject: creditFundedSubject({ messagesUsed: CAP }),
		});

		expect(blocking).toEqual({
			usage_limit: expect.objectContaining({
				limit: CAP,
				interval: "day",
				usage: CAP,
				remaining: 0,
			}),
		});
	},
);

test.concurrent(
	"a usage_limit alert on a feature funded only by credits reads the cap's window",
	() => {
		const alert: DbUsageAlert = {
			feature_id: "messages",
			enabled: true,
			threshold: 80,
			threshold_type: "usage_percentage",
			basis: "usage_limit",
		};

		const measured = measureUsageLimitAlert({
			command: createCheckCommand({ featureId: "messages" }),
			alert,
			feature: messagesFeature(),
			tracked: {
				before: creditFundedSubject({ messagesUsed: 3 }),
				after: creditFundedSubject({ messagesUsed: CAP }),
			},
		});

		expect(measured).toMatchObject({
			before: { usage: 3, remaining: 2 },
			after: { usage: CAP, remaining: 0, denominator: CAP },
		});
	},
);
