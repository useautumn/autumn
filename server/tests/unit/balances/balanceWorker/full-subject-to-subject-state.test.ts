import { expect, test } from "bun:test";
import {
	catalogKeyToString,
	catalogRowToCatalogKey,
	subjectStateToCatalogKeys,
} from "@autumn/balance-engine";
import {
	AllowanceType,
	FeatureType,
	FeatureUsageType,
	fullSubjectToFullCustomer,
	getApiBalance,
} from "@autumn/shared";
import {
	fullSubjectToCatalogRows,
	fullSubjectToSubjectState,
} from "@/internal/balances/balanceWorker/fullSubjectToSubjectState.js";
import { workerCustomerEntitlementToApiBalance } from "@/internal/balances/balanceWorker/workerCustomerEntitlementToApiBalance.js";
import { prices } from "../../../utils/fixtures/db/prices.js";
import { createCustomerFixture } from "./customer-fixture.js";

test.concurrent(
	"picks the customer's rows and the catalog rows they reference without deriving anything",
	() => {
		const fixture = createCustomerFixture();
		const before = structuredClone(fixture.fullSubject);
		const state = fullSubjectToSubjectState({
			...fixture,
			featureIds: ["messages"],
		});
		expect(state).toMatchObject({
			schemaVersion: 1,
			identity: {
				orgId: "org_test",
				env: "sandbox",
				customerId: "cus_test",
				entityId: null,
			},
			revision: 0,
			customerProducts: [{ id: fixture.customerProduct.id }],
			customerEntitlements: [
				{
					id: "messages_grant",
					external_id: "public_grant",
					entitlement_id: fixture.customerEntitlement.entitlement_id,
					internal_feature_id: fixture.feature.internal_id,
					balance: 72,
					adjustment: 10,
				},
			],
			rollovers: [],
			entities: [],
		});
		expect(
			subjectStateToCatalogKeys({ state }).map((key) =>
				catalogKeyToString({ key }),
			),
		).toEqual(
			fullSubjectToCatalogRows({ ...fixture, featureIds: ["messages"] })
				.map((row) =>
					catalogKeyToString({ key: catalogRowToCatalogKey({ row }) }),
				)
				.sort(),
		);
		expect(fixture.fullSubject).toEqual(before);
	},
);

test.concurrent(
	"the worker's row projects to the same API balance the Redis path returns",
	() => {
		const fixture = createCustomerFixture();
		const state = fullSubjectToSubjectState({
			...fixture,
			featureIds: ["messages"],
		});
		const [customerEntitlement] = state.customerEntitlements;
		if (!customerEntitlement) throw new Error("Expected one row");
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

		expect(
			workerCustomerEntitlementToApiBalance({
				ctx: fixture.ctx,
				fullSubject: fixture.fullSubject,
				customerEntitlement,
			}),
		).toEqual(existing);
		expect(
			workerCustomerEntitlementToApiBalance({
				ctx: fixture.ctx,
				fullSubject: fixture.fullSubject,
				customerEntitlement: { ...customerEntitlement, balance: 67 },
			}),
		).toMatchObject({ remaining: 67, usage: existing.usage + 5 });
	},
);

test.concurrent(
	"loose lifetime balances are picked without a product and keep their expiry",
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
		const state = fullSubjectToSubjectState({
			...fixture,
			featureIds: ["messages"],
		});
		expect(state.customerProducts).toEqual([]);
		expect(state.customerEntitlements).toMatchObject([
			{
				id: "messages_grant",
				expires_at: 1_850_000_000_000,
				next_reset_at: null,
			},
		]);
		expect(
			fullSubjectToCatalogRows({ ...fixture, featureIds: ["messages"] }).map(
				(row) => row.table,
			),
		).toEqual(["entitlements", "features"]);
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
			fullSubjectToSubjectState({ ...fixture, featureIds: ["messages"] }),
		).toThrow(expect.objectContaining({ data: { reason }, statusCode: 400 }));
	},
);
