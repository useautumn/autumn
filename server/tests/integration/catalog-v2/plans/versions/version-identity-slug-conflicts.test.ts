/**
 * catalogV2 version identity — projected version_slug collisions (unit 4).
 *
 * Contract:
 *   rename to a sibling's current slug → DuplicateVersionSlug
 *   two entries of the same plan both take "summer" → DuplicateVersionSlug
 *   in-place keeps v1 while another entry takes v1 → DuplicateVersionSlug
 *   mint stamp "summer" + sibling rename to "summer" → DuplicateVersionSlug
 *   two different plan_ids both "summer" → allowed
 *   swap slugs in one call → allowed (final projected set)
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { expectVersionIdentityCorrect } from "../utils/expectVersionIdentity.js";

const seedV1AndV2 = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: planId, name: "V1" }],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				versioning: "new_version",
				active: true,
				name: "V2",
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("version identity slug-conflicts: sibling + two-entries + keep-vs-take")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const siblingId = uniqueTestId("cv2_vid_csib");
		const twoId = uniqueTestId("cv2_vid_ctwo");
		const keepId = uniqueTestId("cv2_vid_ckep");
		await deleteDbPlans({ ctx, planIds: [siblingId, twoId, keepId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId: siblingId });
			await seedV1AndV2({ autumn: autumnV2_3, planId: twoId });
			await seedV1AndV2({ autumn: autumnV2_3, planId: keepId });

			await expectAutumnError({
				errCode: ErrCode.DuplicateVersionSlug,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: siblingId,
								version_slug: "v1",
								new_version_slug: "v2",
							},
						],
					}),
			});
			await expectAutumnError({
				errCode: ErrCode.DuplicateVersionSlug,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: twoId,
								version_slug: "v1",
								new_version_slug: "summer",
							},
							{
								plan_id: twoId,
								version_slug: "v2",
								new_version_slug: "summer",
							},
						],
					}),
			});
			await expectAutumnError({
				errCode: ErrCode.DuplicateVersionSlug,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{ plan_id: keepId, version_slug: "v1", name: "Keep" },
							{
								plan_id: keepId,
								version_slug: "v2",
								new_version_slug: "v1",
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [siblingId, twoId, keepId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity slug-conflicts: mint stamp vs sibling rename")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_cmint");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });
			await expectAutumnError({
				errCode: ErrCode.DuplicateVersionSlug,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								versioning: "new_version",
								new_version_slug: "summer",
								name: "Minted",
							},
							{
								plan_id: planId,
								version_slug: "v1",
								new_version_slug: "summer",
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity slug-conflicts: cross-plan share + swap allowed")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planA = uniqueTestId("cv2_vid_cxa");
		const planB = uniqueTestId("cv2_vid_cxb");
		const swapId = uniqueTestId("cv2_vid_csw");
		await deleteDbPlans({ ctx, planIds: [planA, planB, swapId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId: planA });
			await seedV1AndV2({ autumn: autumnV2_3, planId: planB });
			await seedV1AndV2({ autumn: autumnV2_3, planId: swapId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planA, new_version_slug: "summer" },
					{ plan_id: planB, new_version_slug: "summer" },
				],
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId: planA,
				version: 2,
				versionSlug: "summer",
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId: planB,
				version: 2,
				versionSlug: "summer",
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: swapId,
						version_slug: "v1",
						new_version_slug: "v2",
					},
					{
						plan_id: swapId,
						version_slug: "v2",
						new_version_slug: "v1",
					},
				],
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId: swapId,
				version: 1,
				versionSlug: "v2",
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId: swapId,
				version: 2,
				versionSlug: "v1",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planA, planB, swapId] });
		}
	},
);
