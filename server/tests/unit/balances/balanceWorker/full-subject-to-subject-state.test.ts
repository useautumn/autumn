import { expect, test } from "bun:test";
import {
	catalogKeyToString,
	catalogRowsToCatalog,
	catalogRowToCatalogKey,
	subjectStateToCatalogKeys,
} from "@autumn/balance-engine";
import {
	FeatureType,
	FeatureUsageType,
	fullSubjectToFullCustomer,
	getApiBalance,
} from "@autumn/shared";
import {
	fullSubjectToCatalogRows,
	fullSubjectToSubjectState,
} from "@/internal/balances/balanceWorker/fullSubjectToSubjectState.js";
import {
	workerReplyToFullSubject,
	workerStateToApiBalance,
} from "@/internal/balances/balanceWorker/workerStateToApiBalance.js";
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
			entity: null,
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
		// The catalog a worker reply carries, so the balance is built from the reply alone.
		const catalog = catalogRowsToCatalog({
			rows: fullSubjectToCatalogRows({ ...fixture, featureIds: ["messages"] }),
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

		expect(
			workerStateToApiBalance({
				ctx: fixture.ctx,
				fullSubject: workerReplyToFullSubject({ state, catalog }),
				featureId: "messages",
			}),
		).toEqual(existing);
		expect(
			workerStateToApiBalance({
				ctx: fixture.ctx,
				fullSubject: workerReplyToFullSubject({
					catalog,
					state: {
						...state,
						customerEntitlements: [{ ...customerEntitlement, balance: 67 }],
					},
				}),
				featureId: "messages",
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
		reason: "continuous_usage_not_supported",
		mutate: ({ feature }) => {
			feature.config = { usage_type: FeatureUsageType.Continuous };
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
		reason: "license_not_supported",
		mutate: ({ customerProduct }) => {
			customerProduct.customer_license_link_id = "link_1";
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
