/**
 * catalogV2 — `internal_id` addresses a row that renames cannot break.
 *
 * plan_id and version_slug are both things a config file can change, so
 * neither is a stable handle. `internal_id` is: the server generates it, pull
 * writes it back into fixtures, and a rename rides it instead of looking like
 * a delete plus a create. It is tagged internal, so it never reaches the
 * public spec — only the CLI, which reads the unstripped spec.
 *
 * Contract:
 *   A1  GET echoes internal_id on plans and on nested variants
 *   A2  a row addressed by internal_id is the row that changes — not the
 *       active one, which is what an unaddressed request would hit
 *   A3  internal_id with a different plan_id IS a rename: the row keeps its
 *       identity and the old id survives as an alias
 *   A4  the composite (plan_id, version_slug) still resolves when no id given
 *   A5  an internal_id and a version_slug naming different rows is rejected,
 *       not silently resolved in favour of one
 *   A6  an internal_id nothing owns is rejected, not silently minted
 *
 * Red (current): `internal_id` is absent from the catalogV2 schemas entirely,
 *   so it is stripped from requests and never echoed.
 * Green (after): the id round-trips and addresses rows.
 */

import { expect, test } from "bun:test";
import type { ApiPlanExpandedV1 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { withCatalogPlans } from "../licenses/utils/seedLicensePlans.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
});

const getPlan = async ({
	autumn,
	planId,
}: {
	autumn: AutumnInt;
	planId: string;
}): Promise<ApiPlanExpandedV1> => {
	const catalog = await autumn.catalogV2.get({});
	const plan = catalog.plans.find((row: { id: string }) => row.id === planId);
	expect(plan, `GET catalog plan ${planId}`).toBeDefined();
	return plan!;
};

const versionRow = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version: number;
}) =>
	ProductService.get({
		db: ctx.db,
		id: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

/** v1 keeps history, v2 takes the active pointer. */
const seedTwoVersions = async ({
	autumn,
	planId,
}: {
	autumn: AutumnInt;
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{ plan_id: planId, name: "Internal Id", items: [messagesItem(100)] },
		],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				items: [messagesItem(200)],
				versioning: "new_version",
				active: true,
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 internal_id: GET echoes it, and it addresses the row it names")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_iid_addr");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await seedTwoVersions({ autumn: autumnV2_3, planId });

				// A1: the id is on the response, or pull has nothing to write back.
				const plan = await getPlan({ autumn: autumnV2_3, planId });
				expect(plan.internal_id, "plan internal_id echoed").toMatch(/^prod_/);

				const v1 = await versionRow({ ctx, planId, version: 1 });
				expect(v1?.internal_id, "v1 has an internal id").toBeDefined();

				// A2: address the HISTORY row. An unaddressed request would hit v2.
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							internal_id: v1!.internal_id,
							name: "Renamed V1 Only",
						},
					],
				});

				expect(
					(await versionRow({ ctx, planId, version: 1 }))?.name,
					"addressed row changed",
				).toBe("Renamed V1 Only");
				expect(
					(await versionRow({ ctx, planId, version: 2 }))?.name,
					"active row untouched",
				).toBe("Internal Id");
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 internal_id: a differing plan_id on a known id is a rename")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_iid_rename");
		const renamedId = `${planId}_renamed`;

		await withCatalogPlans({
			ctx,
			planIds: [planId, renamedId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, name: "Before", items: [messagesItem(100)] },
					],
				});
				const before = await versionRow({ ctx, planId, version: 1 });
				const internalId = before!.internal_id;

				// A3: the config states the NEW id and the row's id. No new_plan_id —
				// that is the point: a config file should not have to remember the
				// name it used to use.
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: renamedId,
							internal_id: internalId,
							name: "After",
							items: [messagesItem(100)],
						},
					],
				});

				const renamed = await versionRow({
					ctx,
					planId: renamedId,
					version: 1,
				});
				expect(renamed?.internal_id, "same row, new id").toBe(internalId);
				expect(renamed?.name, "content applied").toBe("After");

				// A3: the old id resolves too — renames mint an alias.
				const viaOldId = await ProductService.getFull({
					db: ctx.db,
					idOrInternalId: internalId,
					orgId: ctx.org.id,
					env: ctx.env,
					allowNotFound: true,
				});
				expect(viaOldId?.id, "row now answers to the new id").toBe(renamedId);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 internal_id: composite still resolves, conflicts and unknowns are rejected")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_iid_guard");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Guarded",
							items: [messagesItem(100)],
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							items: [messagesItem(200)],
							versioning: "new_version",
							new_version_slug: "v2",
							active: true,
						},
					],
				});
				const v1 = await versionRow({ ctx, planId, version: 1 });

				// A4: no internal_id — the composite still addresses the row.
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, version_slug: "v1", name: "Via Slug" }],
				});
				expect(
					(await versionRow({ ctx, planId, version: 1 }))?.name,
					"composite fallback still works",
				).toBe("Via Slug");

				// A5: an id and a slug naming different rows is a caller bug.
				const conflicting = autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							internal_id: v1!.internal_id,
							version_slug: "v2",
							name: "Ambiguous",
						},
					],
				});
				await expect(conflicting).rejects.toThrow();

				// A6: an id nothing owns must not quietly become a new row.
				const unknown = autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							internal_id: "prod_nothingownsthisid",
							name: "Ghost",
						},
					],
				});
				await expect(unknown).rejects.toThrow();
			},
		});
	},
);
