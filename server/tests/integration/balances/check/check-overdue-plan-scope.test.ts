import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	CusProductStatus,
	customerProducts,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";

const markPastDue = async ({
	ctx,
	customerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
}) => {
	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	await ctx.db
		.update(customerProducts)
		.set({ status: CusProductStatus.PastDue })
		.where(eq(customerProducts.internal_customer_id, customer.internal_id));
	await invalidateCachedFullSubject({
		ctx,
		customerId,
		source: "overduePlanScopeTest",
		flushBalances: true,
	});
};

const checkMessages = async ({
	autumn,
	customerId,
	entityId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_4"];
	customerId: string;
	entityId?: string;
}) =>
	autumn.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		...(entityId ? { entity_id: entityId } : {}),
	});

test.concurrent(
	"overdue access: custom plan exemption can be added and removed",
	async () => {
		const standard = products.base({
			id: "overdue-custom-standard",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const {
			ctx,
			customerId,
			autumnV2_4: autumn,
		} = await initScenario({
			customerId: "overdue-plan-scope",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [standard] }),
			],
			actions: [s.billing.attach({ productId: standard.id })],
		});
		try {
			await autumn.patch("/organization/config", {
				block_overdue_entitlements: true,
			});
			await markPastDue({ ctx, customerId });
			expect(await checkMessages({ autumn, customerId })).toMatchObject({
				allowed: false,
			});
			await autumn.products.update(standard.id, {
				config: { ignorePastDue: true, allowOverdueEntitlements: true },
			});
			await markPastDue({ ctx, customerId });
			expect(await checkMessages({ autumn, customerId })).toMatchObject({
				allowed: true,
			});
			await autumn.products.update(standard.id, {
				config: { ignorePastDue: false },
			});
			await invalidateCachedFullSubject({
				ctx,
				customerId,
				source: "overduePlanScopeTest",
			});
			expect(await checkMessages({ autumn, customerId })).toMatchObject({
				allowed: false,
			});
		} finally {
			await autumn.patch("/organization/config", {
				block_overdue_entitlements: ctx.org.config.block_overdue_entitlements,
			});
		}
	},
	{ timeout: 120_000 },
);

test.concurrent(
	"overdue access: entity plans keep exemptions isolated",
	async () => {
		const standard = products.base({
			id: "overdue-entity-standard",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});
		const exempt = products.base({
			id: "overdue-entity-exempt",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});
		exempt.config = { ignore_past_due: true };
		const {
			ctx,
			customerId,
			entities,
			autumnV2_4: autumn,
		} = await initScenario({
			customerId: "overdue-entity-scope",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [standard, exempt] }),
			],
			actions: [
				s.billing.attach({ productId: standard.id, entityIndex: 1 }),
				s.billing.attach({ productId: exempt.id, entityIndex: 0 }),
			],
		});
		try {
			await autumn.patch("/organization/config", {
				block_overdue_entitlements: true,
			});
			await markPastDue({ ctx, customerId });
			expect(
				await checkMessages({ autumn, customerId, entityId: entities[0].id }),
			).toMatchObject({ allowed: true });
			expect(
				await checkMessages({ autumn, customerId, entityId: entities[1].id }),
			).toMatchObject({ allowed: false });
		} finally {
			await autumn.patch("/organization/config", {
				block_overdue_entitlements: ctx.org.config.block_overdue_entitlements,
			});
		}
	},
	{ timeout: 120_000 },
);

test.concurrent(
	"overdue access: boolean and customized license plans",
	async () => {
		const parent = products.base({
			id: "overdue-license-parent",
			items: [items.dashboard()],
		});
		const exemptLicense = products.base({
			id: "overdue-exempt-license",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		exemptLicense.config = { ignore_past_due: true };
		const blockedLicense = products.base({
			id: "overdue-blocked-license",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const {
			ctx,
			customerId,
			entities,
			autumnV2_4: autumn,
		} = await initScenario({
			customerId: "overdue-license-scope",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, exemptLicense, blockedLicense] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: exemptLicense.id,
					included: 1,
				}),
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: blockedLicense.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: exemptLicense.id,
					entityIndex: 0,
				}),
				s.licenses.assign({
					licenseProductId: blockedLicense.id,
					entityIndex: 1,
				}),
			],
		});
		try {
			await autumn.patch("/organization/config", {
				block_overdue_entitlements: true,
			});
			await markPastDue({ ctx, customerId });
			expect(
				await checkMessages({
					autumn,
					customerId,
					entityId: entities[0].id,
				}),
			).toMatchObject({ allowed: true });
			expect(
				await checkMessages({
					autumn,
					customerId,
					entityId: entities[1].id,
				}),
			).toMatchObject({ allowed: false });
			expect(
				await autumn.check<CheckResponseV3>({
					customer_id: customerId,
					feature_id: TestFeature.Dashboard,
				}),
			).toMatchObject({ allowed: true });
		} finally {
			await autumn.patch("/organization/config", {
				block_overdue_entitlements: ctx.org.config.block_overdue_entitlements,
			});
		}
	},
	{ timeout: 120_000 },
);
