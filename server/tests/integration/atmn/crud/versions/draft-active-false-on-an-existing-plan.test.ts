/**
 * atmn crud/versions — draft [active: false on an existing plan] → three versions, active unchanged
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import {
	configBody,
	everyFeatureType,
	versionedPro,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";

/** A minted draft: `active: false` alongside a plan_id that already has an active row. */
const draftV3 = `
		plan({
			planId: "pro",
			name: "Pro",
			versionSlug: "v3",
			active: false,
			price: { amount: 59, interval: "month" },
		}),`;

/** Every live version row for planId "pro", oldest first. */
const livePlanVersions = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<Array<{ version: number; active: boolean }>> => {
	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: ["pro"],
		returnAll: true,
	});
	return products
		.map((product) => ({ version: product.version, active: product.active }))
		.sort((a, b) => a.version - b.version);
};

test.concurrent(
	"a draft alongside the active version adds a third version, active unchanged",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				features: everyFeatureType,
				plans: versionedPro({ versionSlug: "v1", amount: 39 }),
			}),
		});

		try {
			await scenario.push();

			// Mint v2 as the new active version; v1 becomes history.
			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						plans: versionedPro({ versionSlug: "v2", amount: 49 }),
						planVersions: versionedPro({ versionSlug: "v1", amount: 39 }),
					}),
				}),
			);
			await scenario.push();
			expect(await livePlanVersions({ ctx: scenario.ctx })).toEqual([
				{ version: 1, active: false },
				{ version: 2, active: true },
			]);

			// v3 mints as an explicit draft; v2 keeps the active pointer.
			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						plans: `${versionedPro({ versionSlug: "v2", amount: 49 })}${draftV3}`,
						planVersions: versionedPro({ versionSlug: "v1", amount: 39 }),
					}),
				}),
			);
			await expectRoundTrip({ scenario });

			expect(await livePlanVersions({ ctx: scenario.ctx })).toEqual([
				{ version: 1, active: false },
				{ version: 2, active: true },
				{ version: 3, active: false },
			]);
		} finally {
			scenario.cleanup();
		}
	},
);
