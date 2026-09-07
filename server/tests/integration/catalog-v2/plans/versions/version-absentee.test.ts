/**
 * catalogV2.update — skip_version_deletions: false removes a stated plan's
 * versions the payload does not state.
 *
 * Contract:
 *   V1  v1 + v2 exist, v2 active; payload states v2 only with
 *       skip_version_deletions: false → v1 is no longer a live version
 *   V2  the same with a customer on v1 → v1 is archived, not gone, and the
 *       customer still holds it
 *   V3  the same payload without the flag → v1 untouched
 */

import { expect, test } from "bun:test";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";

const twoVersions = async ({
	autumnV2_3,
	planId,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: the loose test client
	autumnV2_3: any;
	planId: string;
}) => {
	await autumnV2_3.catalogV2.update({
		plans: [{ plan_id: planId, name: "Pro", version_slug: "v1" }],
	});
	await autumnV2_3.catalogV2.update({
		plans: [{ plan_id: planId, name: "Pro", version_slug: "v2" }],
	});
};

const liveVersions = async ({
	autumnV2_3,
	planId,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: the loose test client
	autumnV2_3: any;
	planId: string;
}): Promise<{ slug: string; active: boolean }[]> => {
	const catalog = await autumnV2_3.catalogV2.get({ include_versions: true });
	return catalog.plans
		.filter(
			(plan: { id: string; archived?: boolean }) =>
				plan.id === planId && plan.archived !== true,
		)
		.map((plan: { version_slug: string; active: boolean }) => ({
			slug: plan.version_slug,
			active: plan.active,
		}));
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 skip_version_deletions: an unstated version of a stated plan is removed")}`,
	async () => {
		const { autumnV2_3 } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("absent")}@autumn.test`,
				}),
			],
			actions: [],
		});
		const planId = uniqueTestId("absent_version");
		await twoVersions({ autumnV2_3, planId });

		await autumnV2_3.catalogV2.update({
			skip_deletions: false,
			skip_version_deletions: false,
			plans: [{ plan_id: planId, name: "Pro", version_slug: "v2" }],
		});
		expect(await liveVersions({ autumnV2_3, planId })).toEqual([
			{ slug: "v2", active: true },
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 skip_version_deletions: a version a customer holds is archived, not lost")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("absent")}@autumn.test`,
				}),
			],
			actions: [],
		});
		const planId = uniqueTestId("absent_version_cus");
		await twoVersions({ autumnV2_3, planId });
		await seedVersionableCustomer({ ctx, planId, version: 1 });

		await autumnV2_3.catalogV2.update({
			skip_deletions: false,
			skip_version_deletions: false,
			plans: [{ plan_id: planId, name: "Pro", version_slug: "v2" }],
		});
		expect(await liveVersions({ autumnV2_3, planId })).toEqual([
			{ slug: "v2", active: true },
		]);
		const rows = await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			inIds: [planId],
			returnAll: true,
			includeDeleted: true,
		});
		const v1 = rows.find((row) => row.version === 1);
		expect(v1).toBeDefined();
		expect(v1?.archived).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 skip_version_deletions: omitted, unstated versions are left alone")}`,
	async () => {
		const { autumnV2_3 } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("absent")}@autumn.test`,
				}),
			],
			actions: [],
		});
		const planId = uniqueTestId("absent_version_skip");
		await twoVersions({ autumnV2_3, planId });

		await autumnV2_3.catalogV2.update({
			skip_deletions: false,
			plans: [{ plan_id: planId, name: "Pro", version_slug: "v2" }],
		});
		expect((await liveVersions({ autumnV2_3, planId })).length).toBe(2);
	},
);
