import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type NormalizedFullSubject,
	SubjectType,
} from "@autumn/shared";
import { appendSharedFullSubjectBalanceWrite } from "@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setSharedFullSubjectBalances.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";

const buildNormalized = (): NormalizedFullSubject =>
	({
		subjectType: SubjectType.Customer,
		customerId: "cus_1",
		internalCustomerId: "cus_int_1",
		customer: {
			id: "cus_1",
			internal_id: "cus_int_1",
			org_id: "org_1",
			env: AppEnv.Live,
			created_at: 1,
			name: "Test Customer",
			email: "test@example.com",
			fingerprint: null,
			processor: null,
			processors: {},
			metadata: {},
			send_email_receipts: false,
			auto_topups: null,
			spend_limits: null,
			usage_alerts: null,
			overage_allowed: null,
		},
		entity: undefined,
		customer_products: [],
		customer_entitlements: [
			{
				id: "cus_ent_1",
				internal_customer_id: "cus_int_1",
				internal_entity_id: null,
				internal_feature_id: "feat_int_messages",
				feature_id: "messages",
				customer_product_id: null,
				entitlement_id: "ent_1",
				created_at: 1,
				unlimited: false,
				balance: 10,
				adjustment: 0,
				additional_balance: 0,
				usage_allowed: true,
				next_reset_at: null,
				expires_at: null,
				external_id: null,
				entities: null,
				cache_version: 0,
				customer_id: "cus_1",
				entitlement: {
					id: "ent_1",
					internal_product_id: "prod_int_1",
					internal_feature_id: "feat_int_messages",
					feature_id: "messages",
					allowance_type: "fixed",
					allowance: 10,
					interval: "month",
					interval_count: 1,
					usage_limit: null,
					carry_from_previous: false,
					created_at: 1,
					entity_feature_id: null,
					is_custom: false,
					org_id: "org_1",
					rollover: null,
					feature: {
						id: "messages",
						internal_id: "feat_int_messages",
						org_id: "org_1",
						env: AppEnv.Live,
						name: "Messages",
						type: "metered",
						config: null,
						display: null,
						created_at: 1,
						archived: false,
						event_names: [],
					},
				},
				rollovers: [],
				customerPrice: null,
				customerProductOptions: null,
				customerProductQuantity: 1,
			},
		],
		customer_prices: [],
		flags: {},
		products: [],
		entitlements: [],
		prices: [],
		free_trials: [],
		subscriptions: [],
		invoices: [],
		entity_aggregations: undefined,
	}) as NormalizedFullSubject;

const createMultiRecorder = () => {
	const operations: Array<{ type: string; args: unknown[] }> = [];

	const multi = {
		hset: (...args: unknown[]) => {
			operations.push({ type: "hset", args });
			return multi;
		},
		expire: (...args: unknown[]) => {
			operations.push({ type: "expire", args });
			return multi;
		},
		del: (...args: unknown[]) => {
			operations.push({ type: "del", args });
			return multi;
		},
		set: (...args: unknown[]) => {
			operations.push({ type: "set", args });
			return multi;
		},
	};

	return { multi, operations };
};

describe("setSharedFullSubjectBalances", () => {
	test("writes shared balance hashes without meta-key writes or deletes", async () => {
		const normalized = buildNormalized();
		const { multi, operations } = createMultiRecorder();

		await appendSharedFullSubjectBalanceWrite({
			ctx: {
				org: {
					id: "org_1",
				},
				env: AppEnv.Live,
			} as never,
			multi: multi as never,
			normalized,
			meteredFeatures: ["messages"],
			overwrite: true,
			ttlSeconds: 60,
		});

		expect(operations).toEqual([
			{
				type: "hset",
				args: [
					buildSharedFullSubjectBalanceKey({
						orgId: "org_1",
						env: AppEnv.Live,
						customerId: "cus_1",
						featureId: "messages",
					}),
					{
						cus_ent_1: JSON.stringify(normalized.customer_entitlements[0]),
					},
				],
			},
			{
				type: "expire",
				args: [
					buildSharedFullSubjectBalanceKey({
						orgId: "org_1",
						env: AppEnv.Live,
						customerId: "cus_1",
						featureId: "messages",
					}),
					60,
				],
			},
		]);
	});
});
