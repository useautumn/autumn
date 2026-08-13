import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchPlans } from "../../../src/lib/api/endpoints/plans.js";
import { setCliContext } from "../../../src/lib/env/index.js";
import {
	createCleanAtmnIntegrationContext,
	prepareAtmnIntegrationWorkspace,
	runAtmnWorkspaceCli,
} from "../utils/atmnTestWorkspace.js";

/** Red: semicolonless constants duplicated entities and lost null trial overrides.
 * Green: the exact push → pull → push remains stable. */
test("CLI round-trips the reported constant-backed config", async () => {
	const ctx = await createCleanAtmnIntegrationContext();
	const workspace = await prepareAtmnIntegrationWorkspace({
		secretKey: ctx.orgSecretKey,
	});
	await writeFile(
		join(workspace.workspaceDir, "catalog.ts"),
		`export const FEATURE_IDS = { employees: "employees", projects: "projects", ipBox: "ip-box", payroll: "payroll" } as const;
export const METER_PRICES = { employees: 5 } as const;
export const PLAN_IDS = { base: "base", baseYearly: "base-yearly", premium: "premium", premiumYearly: "premium-yearly", addOnProjects: "add-on-projects", addOnIpBox: "add-on-ip-box", addOnPayroll: "add-on-payroll" } as const;
export const PLAN_PRICES = { base: 10, "base-yearly": 100, premium: 20, "premium-yearly": 200, "add-on-projects": 5, "add-on-ip-box": 5 } as const;
`,
	);
	await writeFile(
		workspace.configPath,
		`import { feature, item, plan } from "atmn"

import { FEATURE_IDS, METER_PRICES, PLAN_IDS, PLAN_PRICES } from "./catalog"

export const employees = feature({ id: FEATURE_IDS.employees, name: "Employees", type: "metered", consumable: false })
export const projectsFeature = feature({ id: FEATURE_IDS.projects, name: "Projects", type: "boolean" })
export const ipBoxFeature = feature({ id: FEATURE_IDS.ipBox, name: "IP-box", type: "boolean" })
export const payrollFeature = feature({ id: FEATURE_IDS.payroll, name: "Payroll", type: "boolean" })

export const basePlan = plan({
	id: PLAN_IDS.base,
	name: "Base Plan",
	addOn: false,
	autoEnable: true,
	price: { amount: PLAN_PRICES[PLAN_IDS.base], interval: "month" },
	freeTrial: { durationLength: 30, durationType: "day", cardRequired: false },
})
export const basePlanYearly = basePlan.variant({
	id: PLAN_IDS.baseYearly,
	name: "Base Plan",
	customize: { price: { amount: PLAN_PRICES[PLAN_IDS.baseYearly], interval: "year" }, freeTrial: null },
})
export const premiumPlan = plan({
	id: PLAN_IDS.premium,
	name: "Premium Plan",
	addOn: false,
	autoEnable: false,
	price: { amount: PLAN_PRICES[PLAN_IDS.premium], interval: "month" },
})
export const premiumPlanYearly = premiumPlan.variant({
	id: PLAN_IDS.premiumYearly,
	name: "Premium Plan",
	customize: { price: { amount: PLAN_PRICES[PLAN_IDS.premiumYearly], interval: "year" } },
})
export const addOnProjectsPlan = plan({
	id: PLAN_IDS.addOnProjects,
	name: "Add-on: Projects",
	addOn: true,
	autoEnable: false,
	price: { amount: PLAN_PRICES[PLAN_IDS.addOnProjects], interval: "month" },
	items: [item({ featureId: projectsFeature.id })],
})
export const addOnIpBoxPlan = plan({
	id: PLAN_IDS.addOnIpBox,
	name: "Add-on: IP-box",
	addOn: true,
	autoEnable: false,
	price: { amount: PLAN_PRICES[PLAN_IDS.addOnIpBox], interval: "month" },
	items: [item({ featureId: ipBoxFeature.id })],
})
export const addOnPayrollPlan = plan({
	id: PLAN_IDS.addOnPayroll,
	name: "Add-on: Payroll",
	addOn: true,
	autoEnable: false,
	items: [
		item({ featureId: payrollFeature.id }),
		item({ featureId: employees.id, included: 0, price: { amount: METER_PRICES[FEATURE_IDS.employees], interval: "month", billingUnits: 1, billingMethod: "usage_based" } }),
	],
})
`,
	);

	await runAtmnWorkspaceCli({
		args: ["--yes"],
		command: "push",
		headless: true,
		workspace,
	});
	setCliContext({ local: true });
	const remotePlans = await fetchPlans({ secretKey: ctx.orgSecretKey });
	const remoteBaseYearly = remotePlans.find(({ id }) => id === "base-yearly");
	expect(remoteBaseYearly?.variant_details?.customize?.free_trial).toBeNull();
	expect(remoteBaseYearly?.auto_enable).toBe(false);
	await runAtmnWorkspaceCli({
		args: ["--no-declaration-file"],
		command: "pull",
		headless: true,
		workspace,
	});
	const pulled = await readFile(workspace.configPath, "utf8");
	const exports = [...pulled.matchAll(/export const (\w+)/g)].map(
		([, name]) => name,
	);
	for (const name of [
		"employees",
		"projectsFeature",
		"ipBoxFeature",
		"payrollFeature",
		"basePlan",
		"basePlanYearly",
		"premiumPlan",
		"premiumPlanYearly",
		"addOnProjectsPlan",
		"addOnIpBoxPlan",
		"addOnPayrollPlan",
	]) {
		expect(exports.filter((candidate) => candidate === name)).toHaveLength(1);
	}
	await runAtmnWorkspaceCli({
		args: ["--yes"],
		command: "push",
		headless: true,
		workspace,
	});
	expect(await readFile(workspace.configPath, "utf8")).toBe(pulled);
	const repushedPlans = await fetchPlans({ secretKey: ctx.orgSecretKey });
	const repushedBaseYearly = repushedPlans.find(
		({ id }) => id === "base-yearly",
	);
	expect(repushedBaseYearly?.variant_details?.customize?.free_trial).toBeNull();
	expect(repushedBaseYearly?.auto_enable).toBe(false);
	for (const id of [
		"base",
		"base-yearly",
		"premium",
		"premium-yearly",
		"add-on-projects",
		"add-on-ip-box",
		"add-on-payroll",
	]) {
		expect(repushedPlans.filter((plan) => plan.id === id)).toHaveLength(1);
	}
});
