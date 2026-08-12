import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { writeConfig } from "../../src/commands/pull/writeConfig.js";
import { referralProgram, reward } from "../../src/compose/index.js";
import { loadConfig } from "../../src/lib/config/loadConfig.js";

const withConfigWorkspace = async (
	config: string | null,
	run: (cwd: string) => Promise<void>,
) => {
	const cwd = mkdtempSync(join(tmpdir(), "atmn-config-pipeline-"));
	try {
		writeFileSync(
			join(cwd, "builders.ts"),
			`export { feature, plan } from ${JSON.stringify(
				pathToFileURL(join(import.meta.dir, "../../src/compose/index.ts")).href,
			)};`,
		);
		if (config !== null) writeFileSync(join(cwd, "autumn.config.ts"), config);
		await run(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
};

test("rejects default-exported rewards and referral programs", async () => {
	await withConfigWorkspace(
		`export default {
				rewards: [{ id: "credits", name: "Credits", type: "feature_grant", grants: [{ featureId: "credits", included: 1 }], promoCodes: [{ code: "CREDITS" }] }],
			referralPrograms: [{ id: "refer", rewardId: "credits", redeemOn: "customer_creation", receivedBy: "all" }],
		};`,
		async (cwd) => {
			await expect(loadConfig({ cwd })).rejects.toThrow(
				"must be named reward() and referralProgram() exports",
			);
		},
	);
});

test("in-place pull rejects default-export resources without changing source", async () => {
	const source = `export default {
	rewards: [{ id: "credits", name: "Credits", type: "feature_grant", grants: [{ featureId: "credits", included: 1 }], promoCodes: [{ code: "CREDITS" }] }],
	referralPrograms: [{ id: "refer", rewardId: "credits", redeemOn: "customer_creation", receivedBy: "all" }],
};`;
	await withConfigWorkspace(source, async (cwd) => {
		await expect(
			writeConfig({
				features: [],
				plans: [],
				cwd,
				rewards: [
					reward({
						id: "credits",
						name: "Credits",
						type: "feature_grant",
						grants: [{ featureId: "credits", included: 1 }],
						promoCodes: [{ code: "CREDITS" }],
					}),
				],
				referralPrograms: [
					referralProgram({
						id: "refer",
						rewardId: "credits",
						redeemOn: "customer_creation",
						receivedBy: "all",
					}),
				],
			}),
		).rejects.toThrow("must be named reward() and referralProgram() exports");
		expect(readFileSync(join(cwd, "autumn.config.ts"), "utf8")).toBe(source);
	});
});

test("default-export resources are rejected before constant IDs execute", async () => {
	const source = `throw new Error("must not execute");
export const basePlan = plan({ id: PLAN_IDS.BASE, name: "Base", items: [] });
export default { rewards: [] };`;
	await withConfigWorkspace(source, async (cwd) => {
		await expect(
			writeConfig({ features: [], plans: [], cwd, rewards: [] }),
		).rejects.toThrow("must be named reward() and referralProgram() exports");
		expect(readFileSync(join(cwd, "autumn.config.ts"), "utf8")).toBe(source);
	});
});

test("entity-shaped helper exports do not trigger config execution", async () => {
	const source = `export const buildPlanShape = () => ({ id: PLAN_IDS.BASE, items: [] });`;
	await withConfigWorkspace(source, async (cwd) => {
		await writeConfig({ features: [], plans: [], cwd });
		expect(readFileSync(join(cwd, "autumn.config.ts"), "utf8")).toContain(
			source,
		);
	});
});

test("features-only default exports are not executed during in-place pull", async () => {
	const source = `throw new Error("must not execute");
export default { features: [], plans: [] };`;
	await withConfigWorkspace(source, async (cwd) => {
		await writeConfig({
			features: [],
			plans: [],
			cwd,
			rewards: [],
			referralPrograms: [],
		});
	});
});

test("in-place failures preserve customized source", async () => {
	const source = `// custom source
export const keepMe = "custom";
`;
	await withConfigWorkspace(source, async (cwd) => {
		let reads = 0;
		const unstableFeature = {
			get id() {
				if (reads++ === 0) throw new Error("in-place update failed");
				return "new-feature";
			},
			name: "New feature",
			type: "boolean" as const,
		};

		await expect(
			writeConfig({
				features: [unstableFeature],
				plans: [],
				cwd,
				rewards: [],
				referralPrograms: [],
			}),
		).rejects.toThrow("in-place update failed");
		expect(readFileSync(join(cwd, "autumn.config.ts"), "utf8")).toBe(source);
	});
});

/** Previously, constant IDs were unmatched and rewrites appended suffixed declarations.
 * Existing exports must remain unique across repeated in-place rewrites. */
test("in-place updates match semicolonless exports with constant IDs", async () => {
	await withConfigWorkspace(
		`import { feature, plan } from "./builders"
import { FEATURE_IDS, PLAN_IDS } from "./ids"
export const employees = feature({ id: FEATURE_IDS.EMPLOYEES, name: "Employees", type: "metered", consumable: false })
export const basePlan = plan({ id: PLAN_IDS.BASE, name: "Base Plan", items: [] })
export const basePlanYearly = basePlan.variant({ id: PLAN_IDS.BASE_YEARLY, name: "Base Plan Yearly" })
`,
		async (cwd) => {
			writeFileSync(
				join(cwd, "ids.ts"),
				`export const FEATURE_IDS = { EMPLOYEES: "employees" };
export const PLAN_IDS = { BASE: "base-plan", BASE_YEARLY: "base-plan-yearly" };`,
			);
			const config = {
				features: [
					{
						id: "employees",
						name: "Employees",
						type: "metered" as const,
						consumable: false,
					},
				],
				plans: [
					{
						id: "base-plan",
						name: "Base Plan",
						items: [],
						variants: [{ id: "base-plan-yearly", name: "Base Plan Yearly" }],
					},
				],
			};

			await writeConfig({ ...config, cwd });
			const firstPull = readFileSync(join(cwd, "autumn.config.ts"), "utf8");
			await writeConfig({ ...config, cwd });
			const secondPull = readFileSync(join(cwd, "autumn.config.ts"), "utf8");
			const exports = [...secondPull.matchAll(/export const (\w+)/g)].map(
				([, varName]) => varName,
			);

			expect(exports).toEqual(["employees", "basePlan", "basePlanYearly"]);
			expect(secondPull).toBe(firstPull);
		},
	);
});

/** A removed collision must not change the identity of a constant-ID export.
 * The surviving plan keeps its existing suffixed variable name. */
test("constant-ID exports survive disappearing name collisions", async () => {
	await withConfigWorkspace(
		`import { plan } from "./builders";
import { PLAN_IDS } from "./ids";
export const fooBar = plan({ id: PLAN_IDS.FOO_DASH, name: "Dash", items: [] });
export const fooBarPlan = plan({ id: PLAN_IDS.FOO_UNDERSCORE, name: "Underscore", items: [] });
`,
		async (cwd) => {
			writeFileSync(
				join(cwd, "ids.ts"),
				`export const PLAN_IDS = { FOO_DASH: "foo-bar", FOO_UNDERSCORE: "foo_bar" };`,
			);
			await writeConfig({
				features: [],
				plans: [{ id: "foo_bar", name: "Underscore", items: [] }],
				cwd,
			});
			const source = readFileSync(join(cwd, "autumn.config.ts"), "utf8");
			const exports = [...source.matchAll(/export const (\w+)/g)].map(
				([, varName]) => varName,
			);

			expect(exports).toEqual(["fooBarPlan"]);
			expect(source).toContain("name: 'Underscore'");
		},
	);
});

/** Adding a colliding resource must not rebind an existing constant-ID export.
 * The existing resource keeps its variable name regardless of API order. */
test("constant-ID exports survive new name collisions", async () => {
	await withConfigWorkspace(
		`import { plan } from "./builders";
import { PLAN_IDS } from "./ids";
export const fooBar = plan({ id: PLAN_IDS.FOO_DASH, name: "Dash", items: [] });
`,
		async (cwd) => {
			writeFileSync(
				join(cwd, "ids.ts"),
				`export const PLAN_IDS = { FOO_DASH: "foo-bar" };`,
			);
			await writeConfig({
				features: [],
				plans: [
					{ id: "foo_bar", name: "Underscore", items: [] },
					{ id: "foo-bar", name: "Dash", items: [] },
				],
				cwd,
			});
			const source = readFileSync(join(cwd, "autumn.config.ts"), "utf8");

			expect(source).toMatch(
				/export const fooBar = plan\(\{[\s\S]*?id: 'foo-bar',[\s\S]*?name: 'Dash'/,
			);
			expect(source).toMatch(
				/export const fooBarPlan = plan\(\{[\s\S]*?id: 'foo_bar',[\s\S]*?name: 'Underscore'/,
			);
		},
	);
});

/** Versioned constant-ID plans must use the same identity keys as full codegen.
 * In-place rewrites preserve each version exactly once. */
test("in-place updates match versioned plans with constant IDs", async () => {
	await withConfigWorkspace(
		`import { plan } from "./builders";
import { PLAN_IDS } from "./ids";
export const proV1 = plan({ id: PLAN_IDS.PRO, version: 1, name: "Pro v1", items: [] });
export const proV2 = plan({ id: PLAN_IDS.PRO, version: 2, name: "Pro v2", items: [] });
export const proAnnualV1 = proV2.variant({ id: PLAN_IDS.PRO_ANNUAL, version: 1, name: "Pro annual v1" });
export const proAnnualV2 = proV2.variant({ id: PLAN_IDS.PRO_ANNUAL, version: 2, name: "Pro annual v2" });
`,
		async (cwd) => {
			writeFileSync(
				join(cwd, "ids.ts"),
				`export const PLAN_IDS = { PRO: "pro", PRO_ANNUAL: "pro-annual" };`,
			);
			await writeConfig({
				features: [],
				plans: [
					{ id: "pro", version: 1, name: "Pro v1", items: [] },
					{
						id: "pro",
						version: 2,
						name: "Pro v2",
						items: [],
						variants: [
							{ id: "pro-annual", version: 1, name: "Pro annual v1" },
							{ id: "pro-annual", version: 2, name: "Pro annual v2" },
						],
					},
				],
				cwd,
			});
			const source = readFileSync(join(cwd, "autumn.config.ts"), "utf8");
			const exports = [...source.matchAll(/export const (\w+)/g)].map(
				([, varName]) => varName,
			);

			expect(exports).toEqual(["proV1", "proV2", "proAnnualV1", "proAnnualV2"]);
			expect(source.match(/version: 1/g)).toHaveLength(2);
			expect(source.match(/version: 2/g)).toHaveLength(2);
		},
	);
});

/** Literal version identity must not depend on property order or adjacency.
 * Reordered versioned exports remain stable across in-place rewrites. */
test("in-place updates parse reordered top-level versions", async () => {
	await withConfigWorkspace(
		`import { plan } from "./builders";
export const legacyPro = plan({
	version: 1,
	name: "Pro v1",
	id: "pro",
	items: [],
});
`,
		async (cwd) => {
			await writeConfig({
				features: [],
				plans: [{ id: "pro", version: 1, name: "Pro v1", items: [] }],
				cwd,
			});
			const source = readFileSync(join(cwd, "autumn.config.ts"), "utf8");

			expect([...source.matchAll(/export const (\w+)/g)]).toHaveLength(1);
			expect(source).toContain("export const legacyPro = plan({");
			expect(source).toContain("version: 1");
		},
	);
});

test("merges default and named exports without duplicating aliases", async () => {
	await withConfigWorkspace(
		`const credits = { id: "credits", name: "Credits", type: "metered", consumable: true };
		const namedReward = { id: "bonus", name: "Bonus", type: "feature_grant", grants: [{ featureId: "credits", included: 1 }], promoCodes: [{ code: "BONUS" }] };
		const namedProgram = { id: "refer", rewardId: "bonus", redeemOn: "customer_creation", receivedBy: "all" };
		Object.defineProperty(namedReward, "__atmnType", { value: "reward" });
		Object.defineProperty(namedProgram, "__atmnType", { value: "referral_program" });
		export { credits, namedReward, namedProgram };
		export default { features: [credits], plans: [] };`,
		async (cwd) => {
			const config = await loadConfig({ cwd });
			expect(config.features.map(({ id }) => id)).toEqual(["credits"]);
			expect(config.rewards.map(({ id }) => id)).toEqual(["bonus"]);
			expect(config.referralPrograms.map(({ id }) => id)).toEqual(["refer"]);
		},
	);
});

test("missing configs retain pull guidance", async () => {
	await withConfigWorkspace(null, async (cwd) => {
		await expect(loadConfig({ cwd })).rejects.toThrow("Run 'atmn pull' first.");
	});
});

test("in-place updates add imports for new config resources", async () => {
	await withConfigWorkspace(
		`import { feature, plan } from "atmn";
export const keepMe = "custom";
export const rewardSignup = "custom reward";
export const referralProgramInvite = "custom program";
`,
		async (cwd) => {
			const signup = reward({
				id: "signup",
				name: "Signup credit",
				type: "feature_grant",
				grants: [{ featureId: "credits", included: 1 }],
				promoCodes: [{ code: "SIGNUP" }],
			});
			const invite = referralProgram({
				id: "invite",
				rewardId: signup.id,
				redeemOn: "checkout",
				receivedBy: "referrer",
			});

			await writeConfig({
				features: [],
				plans: [],
				cwd,
				rewards: [signup],
				referralPrograms: [invite],
			});
			const source = readFileSync(join(cwd, "autumn.config.ts"), "utf8");
			const importLine = source.split("\n")[0];

			expect(importLine).toContain("reward");
			expect(importLine).toContain("referralProgram");
			expect(source).toContain('export const keepMe = "custom"');
			expect(source).toContain("export const rewardSignupReward = reward(");
			expect(source).toContain(
				"export const referralProgramInviteReferralProgram = referralProgram(",
			);
			const exports = [...source.matchAll(/export const (\w+)/g)].map(
				([, varName]) => varName,
			);
			expect(new Set(exports).size).toBe(exports.length);
		},
	);
});

test("omitted rewards preserve local resources while explicit empty arrays remove them", async () => {
	await withConfigWorkspace(
		`import { referralProgram, reward } from "atmn";
export const bonus = reward({ id: "bonus", name: "Bonus", type: "feature_grant", grants: [{ featureId: "credits", included: 1 }], promoCodes: [{ code: "BONUS" }] });
export const refer = referralProgram({ id: "refer", rewardId: "bonus", redeemOn: "customer_creation", receivedBy: "all" });
`,
		async (cwd) => {
			await writeConfig({ features: [], plans: [], cwd });
			let source = readFileSync(join(cwd, "autumn.config.ts"), "utf8");
			expect(source).toContain("export const bonus = reward(");
			expect(source).toContain("export const refer = referralProgram(");

			await writeConfig({
				features: [],
				plans: [],
				cwd,
				rewards: [],
				referralPrograms: [],
			});
			source = readFileSync(join(cwd, "autumn.config.ts"), "utf8");
			expect(source).not.toContain("export const bonus");
			expect(source).not.toContain("export const refer");
		},
	);
});

test("pull preserves customized configs when rewards are present", async () => {
	await withConfigWorkspace(
		`import { feature, plan, referralProgram, reward } from "atmn";

// keep this explanation
export const keepMe = { source: "custom" };
export const credits = feature({ id: "credits", name: "Old", type: "metered", consumable: true });
export const pro = plan({ id: "pro", name: "Pro", items: [] });
export const bonus = reward({ id: "bonus", name: "Old bonus", type: "feature_grant", grants: [{ featureId: "credits", included: 1 }], promoCodes: [{ code: "BONUS" }] });
export const staleReward = reward({ id: "stale", name: "Stale", type: "feature_grant", grants: [{ featureId: "credits", included: 1 }], promoCodes: [{ code: "STALE" }] });
export const refer = referralProgram({ id: "refer", rewardId: "bonus", redeemOn: "customer_creation", receivedBy: "referrer" });
export const staleProgram = referralProgram({ id: "stale-program", rewardId: "stale", redeemOn: "customer_creation", receivedBy: "all" });
`,
		async (cwd) => {
			const bonus = reward({
				id: "bonus",
				name: "Bonus",
				type: "feature_grant",
				grants: [{ featureId: "credits", included: 1 }],
				promoCodes: [{ code: "BONUS" }],
			});
			const signup = reward({
				id: "signup",
				name: "Signup credit",
				type: "feature_grant",
				grants: [{ featureId: "credits", included: 1 }],
				promoCodes: [{ code: "SIGNUP" }],
			});
			const refer = referralProgram({
				id: "refer",
				rewardId: bonus.id,
				redeemOn: "customer_creation",
				receivedBy: "all",
			});
			const invite = referralProgram({
				id: "invite",
				rewardId: signup.id,
				redeemOn: "checkout",
				receivedBy: "referrer",
			});
			const result = await writeConfig({
				features: [
					{
						id: "credits",
						name: "Credits",
						type: "metered",
						consumable: true,
					},
				],
				plans: [{ id: "pro", name: "Pro", items: [] }],
				cwd,
				rewards: [bonus, signup],
				referralPrograms: [refer, invite],
			});
			const source = readFileSync(join(cwd, "autumn.config.ts"), "utf8");

			expect(result.inPlace).toBe(true);
			expect(source).toContain("// keep this explanation");
			expect(source).toContain('source: "custom"');
			expect(source).toContain("id: 'bonus'");
			expect(source).toContain("id: 'refer'");
			expect(source).toContain("name: 'Credits'");
			expect(source).toContain("name: 'Bonus'");
			expect(source).toContain("id: 'signup'");
			expect(source).toContain("id: 'invite'");
			expect(source).not.toContain("Old bonus");
			expect(source).not.toContain("stale-program");
			expect(source).not.toContain('id: "stale"');
		},
	);
});
