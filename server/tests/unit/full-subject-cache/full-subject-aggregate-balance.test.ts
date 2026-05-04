import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	FeatureType,
	type FullAggregatedFeatureBalance,
} from "@autumn/shared";
import { mergeAggregatedBalanceIntoApiBalanceV2 } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiBalance/apiBalanceV2Utils.js";

describe("fullSubject aggregate balance", () => {
	test("uses allowance_total when merging aggregated granted balance", () => {
		const aggregatedFeatureBalance: FullAggregatedFeatureBalance = {
			api_id: "cus_ent_agg_messages",
			internal_feature_id: "feat_int_messages",
			internal_customer_id: "cus_int_1",
			feature_id: "messages",
			allowance_total: 250,
			prepaid_grant_from_options: 0,
			balance: 180,
			adjustment: 10,
			additional_balance: 0,
			rollover_balance: 0,
			rollover_usage: 0,
			unlimited: false,
			usage_allowed: false,
			entities: {
				ent1: {
					id: "ent1",
					balance: 100,
					adjustment: 5,
					additional_balance: 0,
					rollover_balance: 0,
					rollover_usage: 0,
				},
				ent2: {
					id: "ent2",
					balance: 80,
					adjustment: 5,
					additional_balance: 0,
					rollover_balance: 0,
					rollover_usage: 0,
				},
			},
			feature: {
				internal_id: "feat_int_messages",
				org_id: "org_1",
				created_at: Date.now(),
				env: AppEnv.Sandbox,
				id: "messages",
				name: "Messages",
				type: FeatureType.Metered,
				config: null,
				display: null,
				archived: false,
				event_names: [],
				is_ai_credit_system: false,
			},
		};

		const merged = mergeAggregatedBalanceIntoApiBalanceV2({
			apiBalance: {
				object: "balance",
				feature_id: "messages",
				feature: undefined,
				granted: 50,
				remaining: 20,
				usage: 30,
				unlimited: false,
				overage_allowed: false,
				max_purchase: null,
				next_reset_at: null,
				breakdown: [],
				rollovers: undefined,
			},
			aggregatedFeatureBalance,
		});

		expect(merged.granted).toBe(310);
		expect(merged.remaining).toBe(200);
		expect(merged.usage).toBe(110);
	});
});
