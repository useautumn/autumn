/**
 * catalogV2.update / preview_update — remove_plans verdicts.
 *
 * Unreferenced plans hard-delete. Expired-only customers tombstone.
 * Versionable customers, reward programs, or a surviving license parent
 * archive instead. Unpinned entries share one verdict across every version.
 */

import { expect, test } from "bun:test";
import {
	CouponDurationType,
	CusProductStatus,
	RewardTriggerEvent,
	RewardType,
	rewardPrograms,
	rewards,
} from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
} from "../../utils/expectCatalogUpdate.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
	expectDbPlansAbsent,
	expectDbPlansCorrect,
	expectPlanVersionsCorrect,
} from "../utils/expectCatalogPlans.js";
import { expectTombstoneCorrect } from "../utils/expectTombstoneCorrect.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../licenses/utils/seedLicensePlans.js";

const seedRewardProgramRef = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	const rewardId = uniqueTestId("cv2_rmp_rew");
	const programId = uniqueTestId("cv2_rmp_rp");
	const internalRewardId = generateId("rew");
	await ctx.db.insert(rewards).values({
		internal_id: internalRewardId,
		id: rewardId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		name: rewardId,
		type: RewardType.PercentageDiscount,
		discount_config: {
			discount_value: 10,
			duration_type: CouponDurationType.OneOff,
			duration_value: 1,
			apply_to_all: false,
			product_ids: [planId],
		},
	});
	await ctx.db.insert(rewardPrograms).values({
		internal_id: generateId("rp"),
		id: programId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		internal_reward_id: internalRewardId,
		product_ids: [planId],
		when: RewardTriggerEvent.Checkout,
		max_redemptions: 1,
		unlimited_redemptions: false,
		exclude_trial: false,
	});
	return { rewardId, programId };
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: unreferenced plans hard delete, archived or not")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const plainId = uniqueTestId("cv2_rmp_plain");
		const archivedId = uniqueTestId("cv2_rmp_arch");
		await deleteDbPlans({ ctx, planIds: [plainId, archivedId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: plainId, name: "Plain" },
					{ plan_id: archivedId, name: "Archived" },
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: archivedId, archived: true }],
			});

			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					remove_plans: [{ plan_id: plainId }, { plan_id: archivedId }],
				}),
				plans: [
					{ planId: plainId, action: "delete", willArchive: false },
					{ planId: archivedId, action: "delete", willArchive: false },
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{ id: plainId, name: "Plain" },
					{ id: archivedId, archived: true },
				],
			});

			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					remove_plans: [{ plan_id: plainId }, { plan_id: archivedId }],
				}),
				plans: [
					{ id: plainId, action: "delete" },
					{ id: archivedId, action: "delete" },
				],
			});
			await expectDbPlansAbsent({ ctx, planIds: [plainId, archivedId] });
		} finally {
			await deleteDbPlans({ ctx, planIds: [plainId, archivedId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: customers and license parents archive instead")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const withCustomerId = uniqueTestId("cv2_rmp_cus");
		const expiredId = uniqueTestId("cv2_rmp_exp");
		const childId = uniqueTestId("cv2_rmp_lic_c");
		const parentId = uniqueTestId("cv2_rmp_lic_p");
		await withCatalogPlans({
			ctx,
			planIds: [withCustomerId, expiredId, childId, parentId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: withCustomerId, name: "With Customer" },
						{ plan_id: expiredId, name: "Expired" },
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{
							plan_id: parentId,
							name: "Team",
							licenses: [{ license_plan_id: childId, included: 1 }],
						},
					],
				});
				await seedVersionableCustomer({ ctx, planId: withCustomerId });
				const expired = await seedVersionableCustomer({
					ctx,
					planId: expiredId,
					status: CusProductStatus.Expired,
				});
				const expiredProduct = await ProductService.get({
					db: ctx.db,
					id: expiredId,
					orgId: ctx.org.id,
					env: ctx.env,
				});
				expect(expiredProduct).toBeDefined();

				expectCatalogPreviewCorrect({
					preview: await autumnV2_3.catalogV2.previewUpdate({
						remove_plans: [
							{ plan_id: withCustomerId },
							{ plan_id: expiredId },
							{ plan_id: childId },
						],
					}),
					plans: [
						{
							planId: withCustomerId,
							action: "delete",
							willArchive: true,
							hasCustomers: true,
						},
						{
							planId: expiredId,
							action: "delete",
							willArchive: false,
							hasCustomers: true,
						},
						{
							planId: childId,
							action: "delete",
							willArchive: true,
							hasCustomers: false,
						},
					],
				});

				await autumnV2_3.catalogV2.update({
					remove_plans: [
						{ plan_id: withCustomerId },
						{ plan_id: expiredId },
						{ plan_id: childId },
					],
				});
				await expectDbPlansCorrect({
					ctx,
					expected: [
						{ id: withCustomerId, archived: true },
						{ id: childId, archived: true },
					],
				});
				await expectTombstoneCorrect({
					ctx,
					planId: expiredId,
					version: expiredProduct!.version,
					previousVersionSlug: expiredProduct!.version_slug ?? "v1",
					internalId: expiredProduct!.internal_id,
					customerProductId: expired.cusProductId,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: unpinned shares archive across versions; pin deletes one")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const sharedId = uniqueTestId("cv2_rmp_share");
		const pinId = uniqueTestId("cv2_rmp_pin");
		await cleanupPlanCustomerRefs({ ctx, planIds: [sharedId, pinId] });
		await deleteDbPlans({ ctx, planIds: [sharedId, pinId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: sharedId, name: "Shared" },
					{ plan_id: pinId, name: "Pin" },
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: sharedId, version: 2, name: "Shared v2" },
					{ plan_id: pinId, version: 2, name: "Pin v2" },
				],
			});
			await seedVersionableCustomer({
				ctx,
				planId: sharedId,
				version: 1,
			});

			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: sharedId }],
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: sharedId, version: 1, archived: true },
					{ id: sharedId, version: 2, archived: true },
				],
			});

			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: pinId, version: 2 }],
			});
			await expectPlanVersionsCorrect({
				ctx,
				planId: pinId,
				versions: [1],
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [sharedId, pinId] });
			await deleteDbPlans({ ctx, planIds: [sharedId, pinId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: reward program ref archives instead")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmp_rewp");
		await deleteDbPlans({ ctx, planIds: [planId] });
		let rewardId: string | undefined;
		let programId: string | undefined;
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Rewarded" }],
			});
			({ rewardId, programId } = await seedRewardProgramRef({
				ctx,
				planId,
			}));

			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					remove_plans: [{ plan_id: planId }],
				}),
				plans: [
					{
						planId,
						action: "delete",
						willArchive: true,
						hasCustomers: false,
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: planId }],
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [{ id: planId, archived: true }],
			});
		} finally {
			if (programId) {
				await ctx.db
					.delete(rewardPrograms)
					.where(eq(rewardPrograms.id, programId));
			}
			if (rewardId) {
				await ctx.db.delete(rewards).where(eq(rewards.id, rewardId));
			}
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
