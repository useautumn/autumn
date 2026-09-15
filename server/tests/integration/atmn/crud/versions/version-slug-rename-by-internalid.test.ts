/**
 * atmn crud/versions — a changed versionSlug beside internalId is a slug
 * rename, the way a changed planId beside internalId is a plan rename. The
 * preview names the move on the row; the push applies it in place (same
 * internalId, no second row minted); the next push finds nothing.
 *
 * Red (current):  push says "No changes" — internalId pins the row and the
 *                 stated slug is discarded.
 * Green (after):  `~ Version slug: "v2" -> "legacy"`, applied, idempotent.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

const proWithSlug = ({
	slug,
	internalId,
}: {
	slug: string;
	internalId?: string;
}) => `{
	plans: [
		plan({ active: true, planId: "pro", versionSlug: "${slug}"${internalId ? `, internalId: "${internalId}"` : ""}, name: "Pro", price: { amount: 39, interval: "month" } }),
	],
}`;

test.concurrent(
	`${chalk.yellowBright("a changed versionSlug beside internalId renames the row in place")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: proWithSlug({ slug: "v1" }),
		});

		try {
			await scenario.push();
			const before = await ProductService.getFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				idOrInternalId: "pro",
			});

			scenario.writeConfig(
				atmnConfigSource({
					body: proWithSlug({
						slug: "legacy",
						internalId: before.internal_id,
					}),
				}),
			);
			const { output } = await scenario.push({ dryRun: true });
			expect(output).toContain("~ pro@v1");
			expect(output).toContain('~ Version slug: "v1" -> "legacy"');

			await expectRoundTrip({ scenario });
			const rows = await ProductService.listFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				inIds: ["pro"],
				returnAll: true,
			});
			expect(
				rows.map((row) => ({
					internalId: row.internal_id,
					versionSlug: row.version_slug,
				})),
			).toEqual([{ internalId: before.internal_id, versionSlug: "legacy" }]);
		} finally {
			scenario.cleanup();
		}
	},
);
