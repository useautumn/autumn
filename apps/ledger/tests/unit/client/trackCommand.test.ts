import { afterEach, describe, expect, it } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	EntInterval,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { LedgerCommandError } from "../../../client/ledgerCommandError.js";
import { trackCommand } from "../../../client/trackCommand.js";
import type { LedgerClientContext } from "../../../client/types/ledgerClient.js";
import type { Command } from "../../../src/api/types/command.js";
import type { TrackResult } from "../../../src/api/track/types/trackResult.js";

const CREATED_AT = 1_600_000_000_000;
const ctx: LedgerClientContext = {
	baseUrl: "http://ledger.test",
	timeoutMs: 1_000,
};

const command: Command = {
	id: "cmd_1",
	org_id: "org_1",
	env: AppEnv.Sandbox,
	customer_id: "cus_1",
	at: 1_700_000_000_000,
	api_version: "1.2",
	kind: "track",
	body: { customer_id: "cus_1", feature_id: "messages", value: 5 },
};

const feature = {
	internal_id: "fi_messages",
	org_id: "org_1",
	created_at: CREATED_AT,
	env: AppEnv.Sandbox,
	id: "messages",
	name: "messages",
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Single },
	archived: false,
	event_names: [],
};

const trackResult: TrackResult = {
	customer_id: "cus_1",
	value: 5,
	features: [feature],
	customer_products: {},
	customer_entitlements: [
		{
			id: "ce_1",
			internal_customer_id: "icus_1",
			internal_entity_id: null,
			internal_feature_id: "fi_messages",
			feature_id: "messages",
			customer_product_id: null,
			entitlement_id: "ent_1",
			created_at: CREATED_AT,
			unlimited: false,
			balance: 95,
			additional_balance: 0,
			adjustment: 0,
			usage_allowed: false,
			separate_interval: false,
			is_pooled_balance: false,
			next_reset_at: null,
			expires_at: null,
			external_id: null,
			cache_version: 0,
			entitlement: {
				id: "ent_1",
				created_at: CREATED_AT,
				internal_feature_id: "fi_messages",
				internal_product_id: "iprod_1",
				is_custom: false,
				allowance_type: AllowanceType.Fixed,
				allowance: 100,
				interval: EntInterval.Month,
				interval_count: 1,
				entity_feature_id: null,
				pooled: false,
				feature_id: "messages",
				usage_limit: null,
				feature,
			},
			replaceables: [],
			rollovers: [],
		},
	],
	mutations: [
		{
			target_type: "customer_entitlement",
			customer_entitlement_id: "ce_1",
			rollover_id: null,
			entity_id: null,
			credit_cost: 1,
			balance_delta: -5,
			adjustment_delta: 0,
			usage_delta: 0,
			value_delta: 5,
		},
	],
};

const realFetch = globalThis.fetch;

const stubFetch = ({
	status,
	body,
}: {
	status: number;
	body: unknown;
}): void => {
	globalThis.fetch = Object.assign(
		() => Promise.resolve(Response.json([{ id: "cmd_1", status, body }])),
		{ preconnect: realFetch.preconnect },
	);
};

afterEach(() => {
	globalThis.fetch = realFetch;
});

describe("trackCommand", () => {
	it("shapes a 200 result into a track response", async () => {
		stubFetch({ status: 200, body: trackResult });

		const response = await trackCommand({ ctx, command });

		expect(response).toMatchObject({
			customer_id: "cus_1",
			value: 5,
			balance: { feature_id: "messages", remaining: 95, usage: 5 },
			deductions: [{ balance_id: "ce_1", feature_id: "messages", value: 5 }],
		});
	});

	it("throws a command error for a non-2xx result", async () => {
		stubFetch({
			status: 400,
			body: { code: "insufficient_balance", message: "not enough" },
		});

		const thrown = await trackCommand({ ctx, command }).catch(
			(error: unknown) => error,
		);

		expect(thrown).toBeInstanceOf(LedgerCommandError);
		expect(thrown).toMatchObject({
			status: 400,
			code: "insufficient_balance",
			message: "not enough",
		});
	});
});
