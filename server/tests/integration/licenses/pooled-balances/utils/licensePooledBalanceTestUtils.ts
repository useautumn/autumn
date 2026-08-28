import { expect } from "bun:test";
import {
	type ApiCustomerV5,
	type CheckResponseV3,
	CusProductStatus,
	EntInterval,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";

export const LICENSE_POOLED_GRANT = 500;

export const lazyLicensePoolLifecycle = {
	interval: EntInterval.Month,
	nextResetAt: "present" as const,
	resetCycleAnchor: "present" as const,
	resetMode: PooledBalanceResetMode.Lazy,
	stripeSubscriptionId: null,
};

export const lifetimeLicensePoolLifecycle = {
	interval: EntInterval.Lifetime,
	nextResetAt: null,
	resetCycleAnchor: null,
	resetMode: PooledBalanceResetMode.Lifetime,
	stripeSubscriptionId: null,
};

export const pooledMonthlyMessages = ({
	includedUsage = LICENSE_POOLED_GRANT,
}: {
	includedUsage?: number;
} = {}) => ({
	...items.monthlyMessages({ includedUsage }),
	pooled: true,
});

export const pooledLifetimeMessages = ({
	includedUsage = LICENSE_POOLED_GRANT,
}: {
	includedUsage?: number;
} = {}) => ({
	...items.lifetimeMessages({ includedUsage }),
	pooled: true,
});

export const pooledMonthlyWords = ({
	includedUsage = LICENSE_POOLED_GRANT,
}: {
	includedUsage?: number;
} = {}) => ({
	...items.monthlyWords({ includedUsage }),
	pooled: true,
});

export const parentPlan = ({
	id,
	group,
}: {
	id: string;
	group?: string;
}) =>
	products.base({
		id,
		items: [items.dashboard()],
		group,
	});

export const pooledSeatPlan = ({
	id,
	item,
}: {
	id: string;
	item: ReturnType<typeof pooledMonthlyMessages>;
}) =>
	products.base({
		id,
		items: [item],
	});

export const seatLinkId = async ({
	db,
	customerId,
	licenseProductId,
}: {
	db: DrizzleCli;
	customerId: string;
	licenseProductId: string;
}) => {
	const { assignments } = await getLicenseDbState({ db, customerId });
	const matching = assignments.filter(
		(candidate) => candidate.product_id === licenseProductId,
	);
	const assignment =
		matching.find(
			(candidate) => candidate.status !== CusProductStatus.Expired,
		) ?? matching[0];
	if (!assignment?.customer_license_link_id) {
		throw new Error(
			`No seat assignment for license ${licenseProductId} on ${customerId}`,
		);
	}
	return assignment.customer_license_link_id;
};

const hydratedLicensePooledEntitlements = async ({
	ctx,
	customerId,
	customerLicenseLinkId,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerLicenseLinkId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		skipReset: true,
	});
	return (fullCustomer.pooled_customer_entitlements ?? []).filter(
		(customerEntitlement) =>
			customerEntitlement.pooled_balance?.customer_license_link_id ===
			customerLicenseLinkId,
	);
};

export const expectLicensePooledEntitlementHydrated = async ({
	ctx,
	customerId,
	customerLicenseLinkId,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerLicenseLinkId: string;
}) => {
	const hydrated = await hydratedLicensePooledEntitlements({
		ctx,
		customerId,
		customerLicenseLinkId,
	});
	expect(hydrated).toHaveLength(1);
};

export const expectLicensePooledEntitlementNotHydrated = async ({
	ctx,
	customerId,
	customerLicenseLinkId,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerLicenseLinkId: string;
}) => {
	const hydrated = await hydratedLicensePooledEntitlements({
		ctx,
		customerId,
		customerLicenseLinkId,
	});
	expect(hydrated).toHaveLength(0);
};

/** Parent liveness hides the license pool at read time — same as seats. */
export const expectLicensePooledBalanceExpired = async ({
	autumn,
	ctx,
	customerId,
	customerLicenseLinkId,
	featureId = TestFeature.Messages,
}: {
	autumn: AutumnInt;
	ctx: AutumnContext;
	customerId: string;
	customerLicenseLinkId: string;
	featureId?: string;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(customer.balances[featureId]).toBeUndefined();
	const check = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: featureId,
		skip_cache: true,
	});
	expect(check.allowed).toBe(false);
	await expectLicensePooledEntitlementNotHydrated({
		ctx,
		customerId,
		customerLicenseLinkId,
	});
};
