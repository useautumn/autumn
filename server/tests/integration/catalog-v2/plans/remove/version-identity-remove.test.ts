/**
 * Hard-delete of the active version promotes the highest remaining live row.
 * Archive does not move `active` — it is all-or-nothing on the plan.
 *
 * Red (current):  omit-version getFull 404s after pin-delete of v2.
 * Green (after):  omit-version getFull returns the surviving tip with active=true.
 */

import { expect, test } from "bun:test";
import { forceActiveVersion } from "@tests/integration/utils/forceActiveVersion.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const expectOmitVersionIs = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version: number;
}) => {
	const omitVersion = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	expect(omitVersion.version).toBe(version);
	expect(omitVersion.active).toBe(true);
};

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
		plans: [{ plan_id: planId, versioning: "new_version", active: true, name: "V2" }],
	});
};

test.concurrent(
	`${chalk.yellowBright("version identity remove: pin-delete of active v2 promotes v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmp_id_tip");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: planId, version: 2 }],
			});
			await expectOmitVersionIs({ ctx, planId, version: 1 });
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity remove: pin-delete of forced-active v1 promotes v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmp_id_low");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });
			await forceActiveVersion({ ctx, planId, version: 1 });
			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: planId, version: 1 }],
			});
			await expectOmitVersionIs({ ctx, planId, version: 2 });
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity remove: products.delete of the active tip promotes v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmp_id_del");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });
			await autumnV2_3.products.delete(planId);
			await expectOmitVersionIs({ ctx, planId, version: 1 });
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity remove: pin-archive of active v2 leaves the pointer on v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmp_id_arch");
		await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });
			await seedVersionableCustomer({ ctx, planId, version: 2 });
			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: planId, version: 2 }],
			});

			const versions = await ProductService.listFull({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				inIds: [planId],
				returnAll: true,
				skipCache: true,
			});
			const v1 = versions.find((product) => product.version === 1);
			const v2 = versions.find((product) => product.version === 2);
			expect(v2?.archived).toBe(true);
			expect(v2?.active).toBe(true);
			expect(v1?.archived).toBe(false);
			expect(v1?.active).toBe(false);
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
