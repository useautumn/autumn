import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeConfig } from "../../src/commands/pull/writeConfig.js";
import { referralProgram, reward } from "../../src/compose/index.js";
import { loadConfig } from "../../src/lib/config/loadConfig.js";

const withConfigWorkspace = async (
	config: string | null,
	run: (cwd: string) => Promise<void>,
) => {
	const cwd = mkdtempSync(join(tmpdir(), "atmn-config-pipeline-"));
	try {
		if (config !== null) writeFileSync(join(cwd, "autumn.config.ts"), config);
		await run(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
};

test("loads reward-only default exports", async () => {
	await withConfigWorkspace(
		`export default {
				rewards: [{ id: "credits", name: "Credits", type: "feature_grant", grants: [{ featureId: "credits", included: 1 }], promoCodes: [{ code: "CREDITS" }] }],
			referralPrograms: [{ id: "refer", rewardId: "credits", redeemOn: "customer_creation", receivedBy: "all" }],
		};`,
		async (cwd) => {
			const config = await loadConfig({ cwd });
			expect(config.rewards.map(({ id }) => id)).toEqual(["credits"]);
			expect(config.referralPrograms.map(({ id }) => id)).toEqual(["refer"]);
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
