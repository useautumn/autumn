import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import createJiti from "jiti";
import type {
	Feature,
	Plan,
	ReferralProgram,
	Reward,
} from "../../compose/index.js";
import { resolveConfigPath } from "../env/index.js";

export type LoadedConfig = {
	features: Feature[];
	plans: Plan[];
	rewards: Reward[];
	referralPrograms: ReferralProgram[];
};

export const loadConfig = async ({
	cwd = process.cwd(),
}: {
	cwd?: string;
} = {}): Promise<LoadedConfig> => {
	const configPath = resolveConfigPath(cwd);
	if (!existsSync(configPath))
		throw new Error(`Config file not found at ${configPath}.`);
	const mod = (await createJiti(import.meta.url).import(
		pathToFileURL(resolve(configPath)).href,
	)) as { default?: Partial<LoadedConfig> & { products?: Plan[] } } & Record<
		string,
		unknown
	>;
	const config: LoadedConfig = {
		features: [],
		plans: [],
		rewards: [],
		referralPrograms: [],
	};
	const defaults = mod.default;
	if (defaults?.features) config.features.push(...defaults.features);
	if (defaults?.plans ?? defaults?.products)
		config.plans.push(...(defaults.plans ?? defaults.products!));
	if (defaults?.rewards) config.rewards.push(...defaults.rewards);
	if (defaults?.referralPrograms)
		config.referralPrograms.push(...defaults.referralPrograms);
	if (defaults?.features || defaults?.plans || defaults?.products)
		return config;
	for (const [name, value] of Object.entries(mod)) {
		if (name === "default" || !value || typeof value !== "object") continue;
		const tagged = value as {
			__atmnType?: string;
			id?: string;
			items?: unknown;
			type?: unknown;
		};
		if (tagged.__atmnType === "variant") continue;
		if (tagged.__atmnType === "reward") config.rewards.push(value as Reward);
		else if (tagged.__atmnType === "referral_program")
			config.referralPrograms.push(value as ReferralProgram);
		else if (
			tagged.__atmnType === "feature" ||
			(!tagged.__atmnType && "type" in tagged)
		)
			config.features.push(value as Feature);
		else if (
			tagged.__atmnType === "plan" ||
			(!tagged.__atmnType && (Array.isArray(tagged.items) || "id" in tagged))
		)
			config.plans.push(value as Plan);
	}
	return config;
};
