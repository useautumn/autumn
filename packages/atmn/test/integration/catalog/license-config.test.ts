/// <reference types="bun" />

import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { ProductService } from "../../../../../server/src/internal/products/ProductService.js";
import {
	createCleanAtmnIntegrationContext,
	prepareAtmnIntegrationWorkspace,
	runAtmnWorkspaceCli,
} from "../utils/atmnTestWorkspace.js";

const config = (included?: number) => `import { plan } from 'atmn';

export const pro = plan({
	id: 'atmn_license_pro',
	name: 'Pro',
	${included === undefined ? "" : `licenses: [{ licensePlanId: 'atmn_license_seats', version: 1, included: ${included} }],`}
});

export const seats = plan({ id: 'atmn_license_seats', name: 'Seats' });
`;

test.concurrent(
	"atmn plan licenses push, pull, update in place, and remove authoritatively",
	async () => {
		const ctx = await createCleanAtmnIntegrationContext();
		const workspace = await prepareAtmnIntegrationWorkspace({
			secretKey: ctx.orgSecretKey,
		});
		const push = (args = ["--yes"]) =>
			runAtmnWorkspaceCli({ args, command: "push", headless: true, workspace });

		await writeFile(workspace.configPath, config(5));
		await push();

		let parent = await ProductService.getFull({
			db: ctx.db,
			env: ctx.env,
			idOrInternalId: "atmn_license_pro",
			orgId: ctx.org.id,
		});
		expect(parent.licenses?.[0]?.included).toBe(5);
		expect(parent.licenses?.[0]?.product).toMatchObject({
			id: "atmn_license_seats",
			version: 1,
		});
		await runAtmnWorkspaceCli({
			args: ["--force", "--no-declaration-file"],
			command: "pull",
			headless: true,
			workspace,
		});
		const pulled = await readFile(workspace.configPath, "utf8");
		expect(pulled).toContain("licensePlanId: 'atmn_license_seats'");
		expect(pulled).toContain("version: 1");
		await push();

		await writeFile(workspace.configPath, config(6));
		await push();
		parent = await ProductService.getFull({
			db: ctx.db,
			env: ctx.env,
			idOrInternalId: "atmn_license_pro",
			orgId: ctx.org.id,
		});
		expect(parent.version).toBe(1);
		expect(parent.licenses?.[0]?.included).toBe(6);

		await writeFile(workspace.configPath, config());
		await push([]);
		parent = await ProductService.getFull({
			db: ctx.db,
			env: ctx.env,
			idOrInternalId: "atmn_license_pro",
			orgId: ctx.org.id,
		});
		expect(parent.licenses).toHaveLength(0);
	},
);
