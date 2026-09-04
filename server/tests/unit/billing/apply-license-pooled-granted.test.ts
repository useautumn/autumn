/**
 * License-keyed pool.granted is purchased seats × per-seat G, even with
 * 0 assignment contributions. applyLicensePooledGranted writes that onto
 * the existing PooledBalancePlan.
 */
import { expect, test } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	EntInterval,
	type EntitlementWithFeature,
	FeatureType,
	type FullCustomerEntitlement,
	type FullCustomerLicense,
	PooledBalanceResetMode,
} from "@autumn/shared";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyLicensePooledGranted } from "@/internal/billing/v2/pooledBalances/compute/applyLicensePooledGranted/applyLicensePooledGranted";
import { setupPooledBalanceComputeContext } from "@/internal/billing/v2/pooledBalances/compute/context/setupPooledBalanceComputeContext";
import { emptyPooledBalancePlan } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan";

const NOW = 1_700_000_000_000;
const LINK_ID = "cus_lic_link_1";
const FEATURE_INTERNAL_ID = "feat_messages";
const PER_SEAT_GRANT = 100;

const pooledMessagesEntitlement = (): EntitlementWithFeature =>
	({
		id: "ent_messages",
		created_at: NOW,
		internal_feature_id: FEATURE_INTERNAL_ID,
		internal_product_id: "prod_seat",
		is_custom: false,
		allowance_type: AllowanceType.Fixed,
		allowance: PER_SEAT_GRANT,
		interval: EntInterval.Month,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: null,
		pooled: true,
		usage_limit: null,
		rollover: null,
		feature_id: "messages",
		org_id: "org_1",
		feature: {
			id: "messages",
			internal_id: FEATURE_INTERNAL_ID,
			type: FeatureType.Metered,
			org_id: "org_1",
			created_at: NOW,
			name: "Messages",
			env: AppEnv.Sandbox,
			archived: false,
			config: null,
			event_names: [],
			display: null,
		},
	}) as EntitlementWithFeature;

const customerLicense = ({
	granted,
}: {
	granted: number;
}): FullCustomerLicense =>
	({
		id: "cus_lic_1",
		link_id: LINK_ID,
		internal_customer_id: "cus_int_1",
		parent_customer_product_id: "cp_parent",
		license_internal_product_id: "prod_seat_int",
		plan_license_id: "pl_1",
		granted,
		remaining: granted,
		paid_quantity: Math.max(0, granted - 0),
		created_at: NOW,
		updated_at: NOW,
		planLicense: {
			id: "pl_1",
			parent_internal_product_id: "prod_parent_int",
			is_custom: false,
			license_internal_product_id: "prod_seat_int",
			included: 0,
			prepaid_only: false,
			customized: false,
			metadata: null,
			created_at: NOW,
			updated_at: NOW,
			product: {
				id: "seat",
				internal_id: "prod_seat_int",
				entitlements: [pooledMessagesEntitlement()],
			},
		},
	}) as FullCustomerLicense;

const ctx = {
	org: { id: "org_1" },
	env: AppEnv.Sandbox,
} as AutumnContext;

const existingPool = ({
	granted,
	balance,
}: {
	granted: number;
	balance: number;
}): FullCustomerEntitlement =>
	({
		id: "cus_ent_pool",
		internal_customer_id: "cus_int_1",
		internal_entity_id: null,
		internal_feature_id: FEATURE_INTERNAL_ID,
		customer_id: "cus_1",
		feature_id: "messages",
		customer_product_id: null,
		entitlement_id: "ent_pool",
		created_at: NOW,
		unlimited: false,
		balance,
		additional_balance: 0,
		usage_allowed: false,
		separate_interval: false,
		is_pooled_balance: true,
		pooled_balance_id: "pool_1",
		pooled_contribution_id: null,
		reset_cycle_anchor: NOW,
		next_reset_at: NOW + 30 * 24 * 60 * 60 * 1000,
		adjustment: 0,
		expires_at: null,
		cache_version: 0,
		entities: null,
		external_id: null,
		entitlement: {
			...pooledMessagesEntitlement(),
			id: "ent_pool",
			internal_product_id: null,
			is_custom: true,
			allowance: 0,
		},
		replaceables: [],
		rollovers: [],
		pooled_balance: {
			id: "pool_1",
			org_id: "org_1",
			env: AppEnv.Sandbox,
			internal_customer_id: "cus_int_1",
			internal_feature_id: FEATURE_INTERNAL_ID,
			unlimited: false,
			granted,
			interval: EntInterval.Month,
			interval_count: 1,
			reset_cycle_anchor: NOW,
			reset_mode: PooledBalanceResetMode.Lazy,
			stripe_subscription_id: null,
			customer_license_link_id: LINK_ID,
			rollover_signature: "none",
			customer_entitlement_id: "cus_ent_pool",
			last_applied_reset_at: null,
			expires_at: null,
			created_at: NOW,
			updated_at: NOW,
		},
	}) as FullCustomerEntitlement;

test(
	chalk.yellowBright(
		"applyLicensePooledGranted: mints a pool at purchased × G with no contributions",
	),
	() => {
		const computeContext = setupPooledBalanceComputeContext({
			pooledCustomerEntitlements: [],
		});

		applyLicensePooledGranted({
			ctx,
			computeContext,
			customerLicenses: [customerLicense({ granted: 3 })],
			now: NOW,
		});

		expect(computeContext.plan.insertPoolBalances).toHaveLength(1);
		const inserted = computeContext.plan.insertPoolBalances[0];
		expect(inserted.pooled_balance?.granted).toBe(300);
		expect(inserted.balance).toBe(300);
		expect(inserted.pooled_balance?.customer_license_link_id).toBe(LINK_ID);
		expect(computeContext.plan.updatePoolBalances).toHaveLength(0);
	},
);

test(
	chalk.yellowBright(
		"applyLicensePooledGranted: grows an under-granted pool without wiping usage",
	),
	() => {
		const computeContext = setupPooledBalanceComputeContext({
			pooledCustomerEntitlements: [existingPool({ granted: 100, balance: 80 })],
		});

		applyLicensePooledGranted({
			ctx,
			computeContext,
			customerLicenses: [customerLicense({ granted: 3 })],
			now: NOW,
		});

		expect(computeContext.plan.insertPoolBalances).toHaveLength(0);
		expect(computeContext.plan.updatePoolBalances).toHaveLength(1);
		const update = computeContext.plan.updatePoolBalances[0];
		expect(update.grantedDelta).toBe(200);
		expect(update.balanceDelta).toBe(200);
		expect(update.pooledCustomerEntitlement.pooled_balance?.granted).toBe(300);
		expect(update.pooledCustomerEntitlement.balance).toBe(280);
	},
);

test(
	chalk.yellowBright(
		"applyLicensePooledGranted: shrinks granted and floors balance at 0",
	),
	() => {
		const computeContext = setupPooledBalanceComputeContext({
			pooledCustomerEntitlements: [existingPool({ granted: 500, balance: 50 })],
		});

		applyLicensePooledGranted({
			ctx,
			computeContext,
			customerLicenses: [customerLicense({ granted: 3 })],
			now: NOW,
		});

		const update = computeContext.plan.updatePoolBalances[0];
		expect(update.grantedDelta).toBe(-200);
		expect(update.pooledCustomerEntitlement.pooled_balance?.granted).toBe(300);
		expect(update.pooledCustomerEntitlement.balance).toBe(0);
	},
);

test(
	chalk.yellowBright(
		"applyLicensePooledGranted: granted 0 does not mint a pool",
	),
	() => {
		const computeContext = setupPooledBalanceComputeContext({
			pooledCustomerEntitlements: [],
		});
		computeContext.plan = emptyPooledBalancePlan();

		applyLicensePooledGranted({
			ctx,
			computeContext,
			customerLicenses: [customerLicense({ granted: 0 })],
			now: NOW,
		});

		expect(computeContext.plan.insertPoolBalances).toHaveLength(0);
		expect(computeContext.plan.updatePoolBalances).toHaveLength(0);
	},
);
