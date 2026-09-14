import { test } from "bun:test";
import { ApiVersion, CusProductStatus, customerProducts } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";

test.concurrent(
	"scenario: overdue override dashboard QA",
	async () => {
		const standard = products.base({
			id: "overdue-standard",
			items: [items.monthlyMessages({ includedUsage: 100 }), items.dashboard()],
		});
		const exempt = products.base({
			id: "overdue-exempt",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.dashboard(),
				items.unlimited({ featureId: TestFeature.Words }),
			],
		});
		exempt.config = {
			ignore_past_due: true,
			allow_overdue_entitlements: true,
		};
		const addon = products.base({
			id: "overdue-active-addon",
			isAddOn: true,
			items: [items.monthlyMessages({ includedUsage: 5 })],
		});
		const customerIds = [
			"qa-overdue-exempt",
			"qa-overdue-blocked",
			"qa-overdue-active",
			"qa-overdue-mixed",
		] as const;
		const { ctx, autumnV2_4: autumn } = await initScenario({
			customerId: customerIds[0],
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [standard, exempt, addon] }),
				s.otherCustomers(customerIds.slice(1).map((id) => ({ id }))),
			],
			actions: [],
		});
		const setStatus = async (customerId: string, status: CusProductStatus) => {
			const customer = await CusService.getFull({
				ctx,
				idOrInternalId: customerId,
			});
			await ctx.db
				.update(customerProducts)
				.set({ status })
				.where(eq(customerProducts.internal_customer_id, customer.internal_id));
			await invalidateCachedFullSubject({
				ctx,
				customerId,
				source: "overdueOverrideQa",
				flushBalances: true,
			});
		};
		for (const customerId of customerIds) {
			await autumn.billing.attach({
				customer_id: customerId,
				plan_id: standard.id,
			});
			await autumn.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 20,
			});
		}
		await autumn.billing.attach({
			customer_id: customerIds[0],
			plan_id: exempt.id,
		});
		await autumn.billing.attach({
			customer_id: customerIds[3],
			plan_id: exempt.id,
		});
		await setStatus(customerIds[0], CusProductStatus.PastDue);
		await setStatus(customerIds[1], CusProductStatus.PastDue);
		await setStatus(customerIds[3], CusProductStatus.PastDue);
		await autumn.patch("/organization/config", {
			block_overdue_entitlements: true,
		});
		new AutumnInt({ version: ApiVersion.V2_4, secretKey: ctx.orgSecretKey });
		console.table(
			customerIds.map((customerId) => ({
				customerId,
				url: `http://localhost:3000/sandbox/customers/${customerId}`,
			})),
		);
		console.log(
			"Org overdue blocking enabled. Test check, track, lock, and toggle behavior from these customers.",
		);
	},
	{ timeout: 180_000 },
);
