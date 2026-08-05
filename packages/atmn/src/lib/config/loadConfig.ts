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

type ConfigModule = {
	default?: Partial<Pick<LoadedConfig, "features" | "plans">> & {
		products?: Plan[];
	};
} & Record<string, unknown>;

export const DEFAULT_REWARD_EXPORT_ERROR =
	"Rewards and referral programs must be named reward() and referralProgram() exports; move them out of the default export before pulling or pushing.";

const importConfig = async ({
	cwd,
}: {
	cwd: string;
}): Promise<ConfigModule> => {
	const configPath = resolveConfigPath(cwd);
	if (!existsSync(configPath))
		throw new Error(
			`Config file not found at ${configPath}. Run 'atmn pull' first.`,
		);
	return createJiti(import.meta.url).import(
		pathToFileURL(resolve(configPath)).href,
	) as Promise<ConfigModule>;
};

export const loadConfig = async ({
	cwd = process.cwd(),
}: {
	cwd?: string;
} = {}): Promise<LoadedConfig> => {
	const mod = await importConfig({ cwd });
	const config: LoadedConfig = {
		features: [],
		plans: [],
		rewards: [],
		referralPrograms: [],
	};
	const defaults = mod.default;
	if (defaults && ("rewards" in defaults || "referralPrograms" in defaults))
		throw new Error(DEFAULT_REWARD_EXPORT_ERROR);
	if (defaults?.features) config.features.push(...defaults.features);
	const defaultPlans = defaults?.plans ?? defaults?.products;
	if (defaultPlans) config.plans.push(...defaultPlans);
	const loadedValues = new Set<unknown>([...config.features, ...config.plans]);
	for (const [name, value] of Object.entries(mod)) {
		if (
			name === "default" ||
			!value ||
			typeof value !== "object" ||
			loadedValues.has(value)
		)
			continue;
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
		loadedValues.add(value);
	}
	return config;
};
