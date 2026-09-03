/**
 * catalogV2.update — the server decides which rows need a migration draft.
 *
 * A draft has only ever appeared when the caller set `migration: { draft: true }`
 * on the very entry it wanted drafted, which means the caller had to work out
 * which plans carry customers. A config-file client cannot: it pushes the whole
 * catalog and knows nothing about who is on what. Request-level `migration`
 * says "draft wherever one is warranted" and hands that judgement to the
 * server, which already answers it per row.
 *
 * Contract:
 *   E1  a request-level draft covers a customered row no entry named
 *   E2  the same push drafts nothing for a plan with no customers
 *   E3  both edits still land in place — neither mints a version
 *   E4  without the flag nothing drafts, so existing callers are untouched
 *
 * Red (current): the claim is per-entry only, so a request-level flag is
 *   ignored and E1 finds no migration at all.
 * Green (after): the request-level flag claims every row, and the existing row
 *   gate — customers, not a mint, neither side archived, non-empty diff —
 *   decides which of them actually produces one.
 */

import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../utils/expectCatalogPlans.js";
import {
	deleteMigrations,
	expectUpdateMigrations,
} from "./utils/expectMigrationDrafts.js";
import { seedVersionableCustomer } from "./utils/seedVersionableCustomer.js";

const messagesItem = ({ included }: { included: number }) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: a request-level draft covers the customered row only")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const customeredId = uniqueTestId("cv2_auto_held");
		const quietId = uniqueTestId("cv2_auto_quiet");
		await deleteDbPlans({ ctx, planIds: [customeredId, quietId] });

		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: customeredId,
						name: "Held",
						items: [messagesItem({ included: 100 })],
					},
					{
						plan_id: quietId,
						name: "Quiet",
						items: [messagesItem({ included: 100 })],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId: customeredId, version: 1 });

			// Neither entry asks for a draft — the request as a whole does, which is
			// all a config push can say. Only `customeredId` has anyone to move.
			const response = await autumnV2_3.catalogV2.update({
				migration: { draft: true },
				plans: [
					{ plan_id: customeredId, items: [messagesItem({ included: 250 })] },
					{ plan_id: quietId, items: [messagesItem({ included: 250 })] },
				],
			});

			// E1 + E2: exactly one draft, and it names the customered row.
			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: customeredId, versions: [1] }]],
			});

			// E3: a draft is what happens INSTEAD of blocking, so both edits applied
			// to the row that was already there.
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: customeredId,
						version: 1,
						allowances: { [TestFeature.Messages]: 250 },
					},
					{
						id: quietId,
						version: 1,
						allowances: { [TestFeature.Messages]: 250 },
					},
				],
			});
		} finally {
			await deleteMigrations({ ctx, ids: [customeredId] });
			await cleanupPlanCustomerRefs({
				ctx,
				planIds: [customeredId, quietId],
			});
			await deleteDbPlans({ ctx, planIds: [customeredId, quietId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: a push with no migration params still drafts nothing")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_auto_optout");
		await deleteDbPlans({ ctx, planIds: [planId] });

		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Opt Out",
						items: [messagesItem({ included: 100 })],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			// E4: the shape every existing caller sends. The row would qualify for a
			// draft on every count except that nothing asked for one.
			const response = await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, items: [messagesItem({ included: 250 })] }],
			});

			expectUpdateMigrations({ response, plans: [] });
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						version: 1,
						allowances: { [TestFeature.Messages]: 250 },
					},
				],
			});
		} finally {
			await deleteMigrations({ ctx, ids: [planId] });
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
