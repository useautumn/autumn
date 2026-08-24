/**
 * catalogV2.update new_plan_id must rewrite the env Vercel allowlist
 * so handleListBillingPlans still lists the renamed plan.
 *
 * Red (current):  allowlist keeps the old public id; listFull({ inIds })
 *                 misses the renamed products.id and the plan vanishes.
 * Green (after):  sandbox allowlist swaps old → new in the rename CTE;
 *                 list billing plans returns the new id, not the old.
 */

import { expect, test } from "bun:test";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import {
	buildTestOidcHeaders,
	seedVercelCustomer,
	setupVercelOrg,
} from "@tests/integration/external-psps/vercel/utils/vercel-test-helpers.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	expectVercelAllowlistRewritten,
	expectVercelBillingPlansListed,
} from "../utils/expectVercelAllowlistCorrect.js";
import { deleteAliases, renamePlan } from "../utils/planAliasTestUtils.js";

const baseUrl = () =>
	(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(
		/\/$/,
		"",
	);

const sandboxAllowlist = ({
	ctx,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
}) => ctx.org.processor_configs?.vercel?.allowed_product_ids_sandbox;

const setSandboxAllowlist = async ({
	ctx,
	planIds,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	planIds: string[] | undefined;
}) => {
	const existing = ctx.org.processor_configs?.vercel;
	if (!existing) throw new Error("Vercel processor config missing");

	const vercel = { ...existing };
	if (planIds === undefined) {
		delete vercel.allowed_product_ids_sandbox;
	} else {
		vercel.allowed_product_ids_sandbox = planIds;
	}

	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			processor_configs: {
				...ctx.org.processor_configs,
				vercel,
			},
		},
	});
	const refreshed = await OrgService.get({ db: ctx.db, orgId: ctx.org.id });
	ctx.org = refreshed;
};

const listVercelBillingPlans = async ({
	ctx,
	installationId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	installationId: string;
}) => {
	const res = await fetch(
		`${baseUrl()}/webhooks/vercel/${ctx.org.id}/${ctx.env}/v1/installations/${installationId}/plans`,
		{ headers: buildTestOidcHeaders(installationId, "user") },
	);
	expect(res.status).toBe(200);
	return (await res.json()) as { plans: Array<{ id: string }> };
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 rename refs: vercel allowlist old id rewritten; plan still listed")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ren_va");
		const newPlanId = uniqueTestId("cv2_ren_va_new");
		const planIds = [planId, newPlanId];
		const customerId = `${planId}-cus`;
		const installationId = `icfg_${planId}`;
		const previousAllowlist = sandboxAllowlist({ ctx });

		await deleteDbPlans({ ctx, planIds });
		await deleteAliases({ ctx, planIds });
		try {
			await setupVercelOrg(ctx);
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Vercel Allowlist",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			await setSandboxAllowlist({
				ctx,
				planIds: [...(previousAllowlist ?? []), planId],
			});

			await renamePlan({ autumn: autumnV2_3, fromId: planId, toId: newPlanId });

			const org = await OrgService.get({ db: ctx.db, orgId: ctx.org.id });
			expectVercelAllowlistRewritten({
				allowlist: org.processor_configs?.vercel?.allowed_product_ids_sandbox,
				oldId: planId,
				newId: newPlanId,
			});

			// Seed after rename so the Vercel subscriber gate does not block it.
			await seedVercelCustomer({ ctx, customerId, installationId });
			const listed = await listVercelBillingPlans({ ctx, installationId });
			expectVercelBillingPlansListed({
				listedIds: listed.plans.map((plan) => plan.id),
				oldId: planId,
				newId: newPlanId,
			});
		} finally {
			await autumnV2_3.customers.delete(customerId).catch(() => {});
			await setSandboxAllowlist({ ctx, planIds: previousAllowlist }).catch(
				() => {},
			);
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
