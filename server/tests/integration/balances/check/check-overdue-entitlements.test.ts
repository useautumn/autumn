import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	type CheckResponseV3,
	CusProductStatus,
	customerProducts,
	organizations,
} from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

test("overdue entitlements: visible balances, plan exemption, mixed deductions and payment recovery", async () => {
	const overdue = products.base({
		id: "overdue",
		items: [items.monthlyMessages({ includedUsage: 100 }), items.dashboard()],
	});
	const enterprise = products.base({
		id: "enterprise",
		isAddOn: true,
		items: [items.free({ featureId: TestFeature.Workflows, includedUsage: 7 })],
	});
	overdue.config = { ignore_past_due: true };
	enterprise.config = {
		ignore_past_due: false,
		allow_overdue_entitlements: true,
	};
	const active = products.base({
		id: "active",
		isAddOn: true,
		items: [items.monthlyMessages({ includedUsage: 5 })],
	});
	const {
		ctx,
		customerId,
		autumnV2_4: autumn,
	} = await initScenario({
		customerId: "check-overdue-entitlements",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [overdue, enterprise, active] }),
		],
		actions: [
			s.billing.attach({ productId: overdue.id }),
			s.billing.attach({ productId: enterprise.id }),
		],
	});
	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const setStatus = async (status: CusProductStatus) => {
		await ctx.db
			.update(customerProducts)
			.set({ status })
			.where(eq(customerProducts.internal_customer_id, customer.internal_id));
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			source: "testOverdueEntitlements",
			flushBalances: true,
		});
	};
	const checkMessages = ({ requiredBalance = 1, sendEvent = false } = {}) =>
		autumn.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: requiredBalance,
			send_event: sendEvent,
		});

	try {
		await deleteLock({ ctx, lockId: customerId });
		for (const blocked of [false, true]) {
			await autumn.patch("/organization/config", {
				block_overdue_entitlements: blocked,
			});
			expect(
				await autumn.check<CheckResponseV3>({
					customer_id: customerId,
					feature_id: TestFeature.Words,
					required_balance: 0,
					send_event: true,
				}),
			).toMatchObject({ allowed: true });
		}
		expect(
			await autumn.check<CheckResponseV3>({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				required_balance: 10,
				lock: { enabled: true, lock_id: customerId },
			}),
		).toMatchObject({ allowed: true, balance: { remaining: 90 } });
		await setStatus(CusProductStatus.PastDue);
		await autumn.patch("/organization/config", {
			block_overdue_entitlements: true,
		});
		for (const skipCache of [false, true]) {
			await expect(
				autumn.balances.finalize(
					{ lock_id: customerId, action: "confirm", override_value: 15 },
					{ skipCache },
				),
			).rejects.toMatchObject({ code: "insufficient_balance" });
		}
		expect(await checkMessages()).toMatchObject({
			allowed: false,
			balance: { remaining: 90 },
		});
		await autumn.balances.finalize({ lock_id: customerId, action: "release" });
		await autumn.patch("/organization/config", {
			block_overdue_entitlements: false,
		});
		expect(await checkMessages()).toMatchObject({
			allowed: true,
			balance: { remaining: 100 },
		});
		await autumn.patch("/organization/config", { include_past_due: false });
		expect(await checkMessages()).toMatchObject({
			allowed: false,
			balance: { remaining: 100 },
		});
		expect(await checkMessages({ sendEvent: true })).toMatchObject({
			allowed: false,
			balance: { remaining: 100 },
		});
		expect(
			await autumn.check<CheckResponseV3>({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				lock: { enabled: true, lock_id: "overdue-lock" },
			}),
		).toMatchObject({ allowed: false, balance: { remaining: 100 } });
		expect(
			await autumn.check<CheckResponseV3>({
				customer_id: customerId,
				feature_id: TestFeature.Dashboard,
			}),
		).toMatchObject({
			allowed: false,
			flag: { feature_id: TestFeature.Dashboard },
		});
		expect(
			await autumn.check<CheckResponseV3>({
				customer_id: customerId,
				feature_id: TestFeature.Workflows,
				send_event: true,
			}),
		).toMatchObject({ allowed: true, balance: { remaining: 6 } });

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		});
		expect(await checkMessages()).toMatchObject({
			allowed: false,
			balance: { remaining: 98 },
		});
		expect(
			(await autumn.customers.get<ApiCustomerV5>(customerId)).balances[
				TestFeature.Messages
			].remaining,
		).toBe(98);

		await invalidateCachedFullSubject({
			ctx,
			customerId,
			source: "testOverdueEntitlements",
			flushBalances: true,
		});
		await autumn.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: active.id,
		});
		expect(await checkMessages({ requiredBalance: 6 })).toMatchObject({
			allowed: false,
			balance: { remaining: 103 },
		});
		expect(
			await checkMessages({ requiredBalance: 3, sendEvent: true }),
		).toMatchObject({ allowed: true, balance: { remaining: 100 } });
		expect(
			await checkMessages({ requiredBalance: 3, sendEvent: true }),
		).toMatchObject({ allowed: false, balance: { remaining: 100 } });
		expect(await checkMessages({ requiredBalance: 2 })).toMatchObject({
			allowed: true,
		});

		await setStatus(CusProductStatus.Active);
		expect(await checkMessages({ requiredBalance: 100 })).toMatchObject({
			allowed: true,
			balance: { remaining: 100 },
		});
	} finally {
		await deleteLock({ ctx, lockId: customerId });
		await ctx.db
			.update(organizations)
			.set({ config: ctx.org.config })
			.where(eq(organizations.id, ctx.org.id));
		await clearOrgCache({ db: ctx.db, orgId: ctx.org.id });
	}
});
