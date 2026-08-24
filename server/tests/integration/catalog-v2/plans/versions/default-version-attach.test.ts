/**
 * Default plans × versioning — attach exactly ONE version: the active pointer.
 *
 * Contract:
 *   Lockstep mint → new customer gets v2; earlier customer stays on v1.
 *   Both rows is_default → customers.create (createWithDefaults) attaches active.
 *   Both rows is_default, v1 forced active → customers.create attaches v1.
 *   Both rows is_default → entities.create (handleCreateEntity) attaches active.
 *
 * Draft mint / promote / slug-promote (default follows the pointer) live in
 * default-follows-active.test.ts.
 */

import { expect, test } from "bun:test";
import { customerProducts, products, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { forceActiveVersion } from "@tests/integration/utils/forceActiveVersion.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { expectAttachedPlanVersionCorrect } from "../utils/expectAttachedPlanVersion.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const getFull = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

const seedDefaultFreeV1 = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: "Free Default V1",
				auto_enable: true,
				group: `g_${planId}`,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		],
	});
};

const mintV2 = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				versioning: "new_version", active: true,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 200,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		],
	});
};

/** cusProduct rows for one customer on one plan, any version. */
const fetchAttachedPlanRows = async ({
	ctx,
	internalCustomerId,
	planId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	planId: string;
}) =>
	ctx.db
		.select()
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.internal_customer_id, internalCustomerId),
				eq(customerProducts.product_id, planId),
			),
		);

/** Entity defaults only attach when this org flag is on; restore after — it is org-wide. */
const setDefaultAppliesToEntities = async ({
	ctx,
	enabled,
}: {
	ctx: AutumnContext;
	enabled: boolean;
}) => {
	const org = await OrgService.get({ db: ctx.db, orgId: ctx.org.id });
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: { ...org.config, default_applies_to_entities: enabled },
		},
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 defaults: customer after mint gets v2 only; earlier customer stays on v1")}`,
	async () => {
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		const planId = uniqueTestId("cv2_def_mint");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedDefaultFreeV1({ autumn: autumnV2_3, planId });

			const beforeMint = await autumnV1.customers.create({
				id: uniqueTestId("cv2_defcus_v1"),
				email: `${planId}-v1@test.com`,
				withAutumnId: true,
				internalOptions: { default_group: `g_${planId}` },
			});

			await mintV2({ autumn: autumnV2_3, planId });

			const afterMint = await autumnV1.customers.create({
				id: uniqueTestId("cv2_defcus_v2"),
				email: `${planId}-v2@test.com`,
				withAutumnId: true,
				internalOptions: { default_group: `g_${planId}` },
			});

			const v1 = await getFull({ ctx, planId, version: 1 });
			const v2 = await getFull({ ctx, planId, version: 2 });

			const beforeRows = await fetchAttachedPlanRows({
				ctx,
				internalCustomerId: beforeMint.autumn_id as string,
				planId,
			});
			expect(beforeRows).toHaveLength(1);
			expect(beforeRows[0]?.internal_product_id).toBe(v1.internal_id);

			const afterRows = await fetchAttachedPlanRows({
				ctx,
				internalCustomerId: afterMint.autumn_id as string,
				planId,
			});
			expect(afterRows).toHaveLength(1);
			expect(afterRows[0]?.internal_product_id).toBe(v2.internal_id);
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 defaults: bad state — v1 AND v2 both is_default → only active attached")}`,
	async () => {
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		const planId = uniqueTestId("cv2_def_dual");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedDefaultFreeV1({ autumn: autumnV2_3, planId });
			await mintV2({ autumn: autumnV2_3, planId });

			// Force the bad state: mint moved the flag to v2, re-flag v1 too.
			const v1 = await getFull({ ctx, planId, version: 1 });
			const v2 = await getFull({ ctx, planId, version: 2 });
			await ctx.db
				.update(products)
				.set({ is_default: true })
				.where(eq(products.internal_id, v1.internal_id));

			const customer = await autumnV1.customers.create({
				id: uniqueTestId("cv2_defcus_dual"),
				email: `${planId}-dual@test.com`,
				withAutumnId: true,
				internalOptions: { default_group: `g_${planId}` },
			});

			const attachedRows = await fetchAttachedPlanRows({
				ctx,
				internalCustomerId: customer.autumn_id as string,
				planId,
			});
			expect(
				attachedRows,
				"exactly one version of the default plan may attach",
			).toHaveLength(1);
			expect(attachedRows[0]?.internal_product_id).toBe(v2.internal_id);
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 defaults: both is_default, v1 forced active → attaches v1")}`,
	async () => {
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		const planId = uniqueTestId("cv2_def_active");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedDefaultFreeV1({ autumn: autumnV2_3, planId });
			await mintV2({ autumn: autumnV2_3, planId });

			const v1 = await getFull({ ctx, planId, version: 1 });
			await ctx.db
				.update(products)
				.set({ is_default: true })
				.where(eq(products.internal_id, v1.internal_id));
			await forceActiveVersion({ ctx, planId, version: 1 });

			const customer = await autumnV1.customers.create({
				id: uniqueTestId("cv2_defcus_active"),
				email: `${planId}-active@test.com`,
				withAutumnId: true,
				internalOptions: { default_group: `g_${planId}` },
			});

			const attachedRows = await fetchAttachedPlanRows({
				ctx,
				internalCustomerId: customer.autumn_id as string,
				planId,
			});
			expect(
				attachedRows,
				"exactly one version of the default plan may attach",
			).toHaveLength(1);
			expect(attachedRows[0]?.internal_product_id).toBe(v1.internal_id);
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test(
	`${chalk.yellowBright("catalogV2 defaults: both is_default → entity create attaches active")}`,
	async () => {
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		const planId = uniqueTestId("cv2_def_ent");
		await deleteDbPlans({ ctx, planIds: [planId] });

		const orgBefore = await OrgService.get({ db: ctx.db, orgId: ctx.org.id });
		const previousAppliesToEntities =
			orgBefore.config.default_applies_to_entities ?? false;

		try {
			await seedDefaultFreeV1({ autumn: autumnV2_3, planId });
			await mintV2({ autumn: autumnV2_3, planId });

			const v1 = await getFull({ ctx, planId, version: 1 });
			await ctx.db
				.update(products)
				.set({ is_default: true })
				.where(eq(products.internal_id, v1.internal_id));

			const customerId = uniqueTestId("cv2_defcus_ent");
			const customer = await autumnV1.customers.create({
				id: customerId,
				email: `${planId}-ent@test.com`,
				withAutumnId: true,
			});

			await setDefaultAppliesToEntities({ ctx, enabled: true });
			const entityId = uniqueTestId("cv2_defent");
			await autumnV1.entities.create(customerId, {
				id: entityId,
				name: "Default entity",
				feature_id: TestFeature.Users,
				customer_data: {
					internal_options: { default_group: `g_${planId}` },
				},
			});

			await expectAttachedPlanVersionCorrect({
				ctx,
				internalCustomerId: customer.autumn_id as string,
				planId,
				version: 2,
				entityId,
			});
		} finally {
			try {
				await setDefaultAppliesToEntities({
					ctx,
					enabled: previousAppliesToEntities,
				});
			} finally {
				await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
				await deleteDbPlans({ ctx, planIds: [planId] });
			}
		}
	},
);
