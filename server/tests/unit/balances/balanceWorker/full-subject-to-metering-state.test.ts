import { expect, test } from "bun:test";
import {
	AllowanceType,
	FeatureType,
	FeatureUsageType,
	fullSubjectToFullCustomer,
	getApiBalance,
	ResetInterval,
} from "@autumn/shared";
import { fullSubjectToMeteringState } from "@/internal/balances/balanceWorker/fullSubjectToMeteringState.js";
import { meteringBalanceToApiBalance } from "@/internal/balances/balanceWorker/meteringBalanceToApiBalance.js";
import { prices } from "../../../utils/fixtures/db/prices.js";
import { createCustomerFixture } from "./customer-fixture.js";

test.concurrent(
	"maps a real customer shape with its external identity, grant and reset metadata",
	() => {
		const fixture = createCustomerFixture();
		const before = structuredClone(fixture.fullSubject);
		const state = fullSubjectToMeteringState({
			...fixture,
			featureIds: ["messages"],
		});
		expect(state).toEqual({
			schemaVersion: 1,
			identity: { orgId: "org_test", env: "sandbox", customerId: "cus_test" },
			revision: 0,
			featureStatesById: {
				messages: {
					kind: "direct_metered_v1",
					customerEntitlements: [
						{
							id: "messages_grant",
							externalId: "public_grant",
							balance: 72,
							usage: 38,
							granted: 110,
							planId: "pro",
							reset: {
								interval: "month",
								intervalCount: 1,
								nextResetAt: 1_800_000_000_000,
							},
							expiresAt: null,
						},
					],
				},
			},
		});
		const apiBalance = meteringBalanceToApiBalance({
			featureId: "messages",
			snapshot: state.featureStatesById.messages.customerEntitlements[0],
		});
		const existing = getApiBalance({
			ctx: fixture.ctx,
			fullCus: fullSubjectToFullCustomer({ fullSubject: fixture.fullSubject }),
			cusEnts: [
				{
					...fixture.customerEntitlement,
					customer_product: fixture.customerProduct,
				},
			],
			feature: fixture.feature,
		}).data;
		expect(apiBalance).toMatchObject({
			granted: existing.granted,
			remaining: existing.remaining,
			usage: existing.usage,
			unlimited: existing.unlimited,
			overage_allowed: existing.overage_allowed,
			max_purchase: existing.max_purchase,
			next_reset_at: existing.next_reset_at,
			breakdown: existing.breakdown,
		});
		expect(fixture.fullSubject).toEqual(before);
	},
);

test.concurrent(
	"loose lifetime balances preserve quantity, expiry and public IDs without a plan",
	() => {
		const fixture = createCustomerFixture();
		fixture.fullSubject.customer_products = [];
		fixture.customerEntitlement.customer_product_id = null;
		fixture.customerEntitlement.entitlement.interval = null;
		fixture.customerEntitlement.next_reset_at = null;
		fixture.customerEntitlement.expires_at = 1_850_000_000_000;
		fixture.fullSubject.extra_customer_entitlements = [
			fixture.customerEntitlement,
		];
		const state = fullSubjectToMeteringState({
			...fixture,
			featureIds: ["messages"],
		});
		expect(
			meteringBalanceToApiBalance({
				featureId: "messages",
				snapshot: state.featureStatesById.messages.customerEntitlements[0],
			}),
		).toMatchObject({
			granted: 110,
			remaining: 72,
			usage: 38,
			next_reset_at: null,
			breakdown: [
				{
					id: "public_grant",
					plan_id: null,
					reset: { interval: ResetInterval.OneOff, resets_at: null },
					expires_at: 1_850_000_000_000,
				},
			],
		});
	},
);

type Fixture = ReturnType<typeof createCustomerFixture>;
const unsupported: { reason: string; mutate: (fixture: Fixture) => void }[] = [
	{
		reason: "subject_mismatch",
		mutate: ({ customer }) => {
			customer.org_id = "another-org";
		},
	},
	{
		reason: "subject_mismatch",
		mutate: ({ fullSubject }) => {
			fullSubject.customerId = "internal-not-public";
		},
	},
	{
		reason: "entity_not_supported",
		mutate: ({ fullSubject }) => {
			fullSubject.subjectType = "entity";
		},
	},
	{
		reason: "boolean_not_supported",
		mutate: ({ feature }) => {
			feature.type = FeatureType.Boolean;
		},
	},
	{
		reason: "credit_system_not_supported",
		mutate: ({ feature }) => {
			feature.type = FeatureType.CreditSystem;
		},
	},
	{
		reason: "credit_system_not_supported",
		mutate: ({ ctx, feature }) => {
			ctx.features.push({
				...feature,
				id: "credits",
				type: FeatureType.CreditSystem,
				config: {
					schema: [{ metered_feature_id: "messages", credit_amount: 2 }],
				},
			});
		},
	},
	{
		reason: "continuous_usage_not_supported",
		mutate: ({ feature }) => {
			feature.config = { usage_type: FeatureUsageType.Continuous };
		},
	},
	{
		reason: "unlimited_not_supported",
		mutate: ({ customerEntitlement }) => {
			customerEntitlement.unlimited = true;
		},
	},
	{
		reason: "unlimited_not_supported",
		mutate: ({ customerEntitlement }) => {
			customerEntitlement.entitlement.allowance_type = AllowanceType.Unlimited;
		},
	},
	{
		reason: "overage_not_supported",
		mutate: ({ customerEntitlement }) => {
			customerEntitlement.usage_allowed = true;
		},
	},
	{
		reason: "usage_limit_not_supported",
		mutate: ({ customerEntitlement }) => {
			customerEntitlement.entitlement.usage_limit = 100;
		},
	},
	{
		reason: "pooled_balance_not_supported",
		mutate: ({ customerEntitlement }) => {
			customerEntitlement.entitlement.pooled = true;
		},
	},
	{
		reason: "pooled_balance_not_supported",
		mutate: ({ fullSubject, customerEntitlement }) => {
			fullSubject.pooled_customer_entitlements = [
				{ ...customerEntitlement, is_pooled_balance: true },
			];
		},
	},
	{
		reason: "entity_not_supported",
		mutate: ({ customerEntitlement }) => {
			customerEntitlement.entitlement.entity_feature_id = "seats";
		},
	},
	{
		reason: "additional_balance_not_supported",
		mutate: ({ customerEntitlement }) => {
			customerEntitlement.additional_balance = 5;
		},
	},
	{
		reason: "reset_due",
		mutate: ({ customerEntitlement, ctx }) => {
			customerEntitlement.next_reset_at = ctx.timestamp;
		},
	},
	{
		reason: "expired_entitlement",
		mutate: ({ customerEntitlement, ctx }) => {
			customerEntitlement.expires_at = ctx.timestamp;
		},
	},
	{
		reason: "multiple_customer_entitlements_not_supported",
		mutate: ({ customerProduct, customerEntitlement }) => {
			customerProduct.customer_entitlements.push({
				...customerEntitlement,
				id: "extra",
			});
		},
	},
	{
		reason: "priced_entitlement_not_supported",
		mutate: ({ customerProduct }) => {
			customerProduct.customer_prices.push(
				prices.createCustomer({
					price: prices.createConsumable({
						id: "usage_price",
						featureId: "messages",
					}),
				}),
			);
		},
	},
	{
		reason: "billing_controls_not_supported",
		mutate: ({ customer }) => {
			customer.overage_allowed = [{ feature_id: "messages", enabled: true }];
		},
	},
	{
		reason: "billing_controls_not_supported",
		mutate: ({ customerProduct }) => {
			customerProduct.product.overage_allowed = [
				{ feature_id: "messages", enabled: true },
			];
		},
	},
];

test.concurrent.each(unsupported)(
	"refuses $reason before creating a baseline",
	({ reason, mutate }) => {
		const fixture = createCustomerFixture();
		mutate(fixture);
		expect(() =>
			fullSubjectToMeteringState({ ...fixture, featureIds: ["messages"] }),
		).toThrow(expect.objectContaining({ data: { reason }, statusCode: 400 }));
	},
);
