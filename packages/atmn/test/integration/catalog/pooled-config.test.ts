/// <reference types="bun" />

import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { ProductService } from "../../../../../server/src/internal/products/ProductService.js";
import {
	createCleanAtmnIntegrationContext,
	prepareAtmnIntegrationWorkspace,
	runAtmnWorkspaceCli,
} from "../utils/atmnTestWorkspace.js";

const config = (pooled: boolean) => `import { feature, item, plan } from 'atmn';

export const poolSeats = feature({
	id: 'atmn_pool_seats',
	name: 'Pool Seats',
	type: 'metered',
	consumable: false,
});

export const poolCredits = feature({
	id: 'atmn_pool_credits',
	name: 'Pool Credits',
	type: 'metered',
	consumable: true,
});

export const team = plan({
	id: 'atmn_pooled_team',
	name: 'Pooled Team',
	items: [
		item({
			featureId: poolCredits.id,
			entityFeatureId: poolSeats.id,
			${pooled ? "pooled: true," : ""}
			included: 500,
			reset: { interval: 'month' },
		}),
	],
});
`;

test.concurrent(
	"atmn pooled items push, pull round-trip, and unset in place",
	async () => {
		const ctx = await createCleanAtmnIntegrationContext();
		const workspace = await prepareAtmnIntegrationWorkspace({
			secretKey: ctx.orgSecretKey,
		});
		const push = () =>
			runAtmnWorkspaceCli({
				args: ["--yes"],
				command: "push",
				headless: true,
				workspace,
			});
		const getEntitlement = async () => {
			const product = await ProductService.getFull({
				db: ctx.db,
				env: ctx.env,
				idOrInternalId: "atmn_pooled_team",
				orgId: ctx.org.id,
			});
			return product.entitlements.find(
				(entitlement) => entitlement.feature.id === "atmn_pool_credits",
			);
		};

		await writeFile(workspace.configPath, config(true));
		await push();

		let entitlement = await getEntitlement();
		expect(entitlement?.pooled).toBe(true);
		expect(entitlement?.entity_feature_id).toBe("atmn_pool_seats");

		await runAtmnWorkspaceCli({
			args: ["--force", "--no-declaration-file"],
			command: "pull",
			headless: true,
			workspace,
		});
		const pulled = await readFile(workspace.configPath, "utf8");
		expect(pulled).toContain("pooled: true");
		expect(pulled).toContain("entityFeatureId: 'atmn_pool_seats'");
		await push();

		entitlement = await getEntitlement();
		expect(entitlement?.pooled).toBe(true);

		await writeFile(workspace.configPath, config(false));
		await push();
		entitlement = await getEntitlement();
		expect(entitlement?.pooled).toBe(false);
	},
);
