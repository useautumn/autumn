import { describe, expect, test } from "bun:test";
import { FeatureType } from "../../models/featureModels/featureEnums.js";
import { AppEnv } from "../../models/genModels/genEnums.js";
import type { SharedContext } from "../../types/sharedContext.js";
import type { CheckResponseV3 } from "../balances/check/checkResponseV3.js";
import type { TrackResponseV3 } from "../balances/track/trackResponseV3.js";
import type { ApiCustomerV5 } from "../customers/apiCustomerV5.js";
import type { ApiBalanceV1 } from "../customers/cusFeatures/apiBalanceV1.js";
import { transformBalanceToCusFeatureV3 } from "../customers/cusFeatures/changes/V1.2_CusFeatureChange.js";
import { balanceV1ToV0 } from "../customers/cusFeatures/mappers/balanceV1ToV0.js";
import { ApiVersion } from "../versionUtils/ApiVersion.js";
import { ApiVersionClass } from "../versionUtils/ApiVersionClass.js";
import { applyResponseVersionChanges } from "../versionUtils/versionChangeUtils/applyVersionChanges.js";
import { AffectedResource } from "../versionUtils/versionChangeUtils/VersionChange.js";
import type { ApiFeatureV1 } from "./apiFeatureV1.js";
import { V1_2_FeatureChange } from "./changes/V1.2_FeatureChange.js";

const ctx = {} as SharedContext;
const targetVersion = new ApiVersionClass(ApiVersion.V2_3);

const buildFeature = ({
	creditSchema,
}: {
	creditSchema: ApiFeatureV1["credit_schema"];
}): ApiFeatureV1 => ({
	id: "credits",
	name: "Credits",
	type: FeatureType.CreditSystem,
	consumable: true,
	event_names: [],
	credit_schema: creditSchema,
	invoice_credit: true,
	archived: false,
});

const incompatibleFeature = buildFeature({
	creditSchema: [
		{
			metered_feature_id: "feature_a",
			billing_units: 100,
			credit_cost: 1,
		},
		{
			metered_feature_id: "feature_b",
			tier_behavior: "graduated",
			tiers: [{ to: "inf", credit_cost: 0.5 }],
		},
	],
});

const balance: ApiBalanceV1 = {
	object: "balance",
	feature_id: incompatibleFeature.id,
	feature: incompatibleFeature,
	granted: 10_000,
	remaining: 9_000,
	usage: 1_000,
	unlimited: false,
	overage_allowed: false,
	max_purchase: null,
	next_reset_at: null,
};

const assertFeatureIsV2_3Compatible = (feature: unknown) => {
	expect(feature).not.toHaveProperty("invoice_credit");
	expect(feature).not.toHaveProperty("credit_schema");
};

describe("credit rate-card response versioning", () => {
	test("versions expanded features in customer balances and flags", () => {
		const customer: ApiCustomerV5 = {
			id: "customer_1",
			name: null,
			email: null,
			created_at: 1,
			fingerprint: null,
			stripe_id: null,
			env: AppEnv.Sandbox,
			metadata: {},
			send_email_receipts: false,
			billing_controls: {},
			subscriptions: [],
			purchases: [],
			licenses: [],
			balances: { credits: balance },
			flags: {
				credits: {
					object: "flag",
					id: "cus_ent_credits",
					plan_id: null,
					expires_at: null,
					feature_id: incompatibleFeature.id,
					feature: incompatibleFeature,
				},
			},
		};

		const response = applyResponseVersionChanges({
			input: customer,
			targetVersion,
			resource: AffectedResource.Customer,
			ctx,
		});

		assertFeatureIsV2_3Compatible(response.balances.credits.feature);
		assertFeatureIsV2_3Compatible(response.flags.credits.feature);
	});

	test("versions expanded features in check responses", () => {
		const response = applyResponseVersionChanges({
			input: {
				allowed: true,
				customer_id: "customer_1",
				entity_id: null,
				balance,
				balances: { credits: balance },
				flag: {
					object: "flag",
					id: "cus_ent_credits",
					plan_id: null,
					expires_at: null,
					feature_id: incompatibleFeature.id,
					feature: incompatibleFeature,
				},
			} satisfies CheckResponseV3,
			targetVersion,
			resource: AffectedResource.Check,
			ctx,
		});

		assertFeatureIsV2_3Compatible(response.balance?.feature);
		assertFeatureIsV2_3Compatible(response.balances?.credits?.feature);
		assertFeatureIsV2_3Compatible(response.flag?.feature);
	});

	test("versions expanded features in track responses", () => {
		const response = applyResponseVersionChanges({
			input: {
				customer_id: "customer_1",
				value: 1,
				balance,
				balances: { credits: balance },
			} satisfies TrackResponseV3,
			targetVersion,
			resource: AffectedResource.Track,
			ctx,
		});

		assertFeatureIsV2_3Compatible(response.balance?.feature);
		assertFeatureIsV2_3Compatible(response.balances?.credits?.feature);
	});

	test.each([
		{
			name: "per-X flat card",
			creditSchema: [
				{
					metered_feature_id: "feature_a",
					billing_units: 100,
					credit_cost: 1,
				},
			] satisfies ApiFeatureV1["credit_schema"],
		},
		{
			name: "mixed flat and graduated card",
			creditSchema: incompatibleFeature.credit_schema,
		},
	])(
		"omits a $name from older feature and customer shapes",
		({ creditSchema }) => {
			const feature = buildFeature({ creditSchema });
			const featureResponse = new V1_2_FeatureChange().transformResponse({
				input: feature,
				ctx,
			});
			const customerFeatureResponse = transformBalanceToCusFeatureV3({
				input: balanceV1ToV0({ input: { ...balance, feature } }),
			});

			expect(featureResponse.credit_schema).toBeNull();
			expect(customerFeatureResponse.credit_schema).toBeUndefined();
		},
	);
});
