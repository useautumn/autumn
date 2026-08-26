/**
 * Default flag follows the active pointer on a free auto_enable plan.
 *
 * Contract:
 *   Promote existing draft (`version_slug` + `active: true`) → that row is
 *   active + is_default; the previous pointer loses both.
 *   Same for a custom slug (e.g. "summer"): pointer and default move together.
 *   Paid draft: pointer moves; is_default stays on the free v1
 *   (`handleDefaultFlagErrors` rejects default on a paid row — do not 400).
 *   Cardless-trial paid draft: eligible, so default follows the promote.
 *   Explicit `auto_enable: true` on a historical promote → 400.
 *
 * Draft-mint identity (omit `active` → v2 inactive, v1 keeps default) lives in
 * version-identity-mint.test.ts — asserted here only as the pre-promote state.
 *
 * Unit 5 / slug targeting may be unwired; these tests document the contract.
 */

import { test } from "bun:test";
import {
	BillingInterval,
	ErrCode,
	FreeTrialDuration,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { expectVersionIdentityCorrect } from "../utils/expectVersionIdentity.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
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
				items: [messagesItem(100)],
			},
		],
	});
};

const mintDraftV2 = async ({
	autumn,
	planId,
	newVersionSlug,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
	newVersionSlug?: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				versioning: "new_version",
				name: "V2 Draft",
				...(newVersionSlug ? { new_version_slug: newVersionSlug } : {}),
				items: [messagesItem(200)],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 defaults: promoting a draft via version_slug makes it default")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		const planId = uniqueTestId("cv2_def_promo");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedDefaultFreeV1({ autumn: autumnV2_3, planId });
			await mintDraftV2({ autumn: autumnV2_3, planId });

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: true,
				isDefault: true,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				versionSlug: "v2",
				active: false,
				isDefault: false,
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version_slug: "v2", active: true }],
			});

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: false,
				isDefault: false,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				versionSlug: "v2",
				active: true,
				isDefault: true,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 defaults: promoting a custom slug moves pointer and default")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		const planId = uniqueTestId("cv2_def_slug");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedDefaultFreeV1({ autumn: autumnV2_3, planId });
			await mintDraftV2({
				autumn: autumnV2_3,
				planId,
				newVersionSlug: "summer",
			});

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: true,
				isDefault: true,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				versionSlug: "summer",
				active: false,
				isDefault: false,
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version_slug: "summer", active: true }],
			});

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: false,
				isDefault: false,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				versionSlug: "summer",
				active: true,
				isDefault: true,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 defaults: promoting a paid draft moves pointer, default stays on free v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		const planId = uniqueTestId("cv2_def_paid");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedDefaultFreeV1({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						name: "Paid Draft",
						create_in_stripe: false,
						price: { amount: 20, interval: BillingInterval.Month },
						items: [messagesItem(200)],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version_slug: "v2", active: true }],
			});

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: false,
				isDefault: true,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				versionSlug: "v2",
				active: true,
				isDefault: false,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 defaults: promoting a cardless-trial draft takes default")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		const planId = uniqueTestId("cv2_def_ct");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Paid Trial V1",
						auto_enable: true,
						create_in_stripe: false,
						price: { amount: 20, interval: BillingInterval.Month },
						free_trial: {
							duration_type: FreeTrialDuration.Day,
							duration_length: 14,
							card_required: false,
						},
						items: [messagesItem(100)],
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						name: "Paid Trial V2",
						items: [messagesItem(200)],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version_slug: "v2", active: true }],
			});

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: false,
				isDefault: false,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				versionSlug: "v2",
				active: true,
				isDefault: true,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 defaults: auto_enable on historical promote → HistoricalPlanVersionCannotBeDefault")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		const planId = uniqueTestId("cv2_def_histp");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedDefaultFreeV1({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						active: true,
						name: "V2 Live",
						items: [messagesItem(200)],
					},
				],
			});

			await expectAutumnError({
				errCode: ErrCode.HistoricalPlanVersionCannotBeDefault,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								version_slug: "v1",
								active: true,
								auto_enable: true,
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
