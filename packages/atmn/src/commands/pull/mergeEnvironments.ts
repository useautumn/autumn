import type { Plan } from "../../compose/models/variantModels.js";
import type { EnvironmentData } from "./types.js";

const planKey = (plan: Plan) =>
	plan.version === undefined ? plan.id : `${plan.id}:${plan.version}`;

const mergeByKey = <T>({
	sandbox,
	production,
	key,
}: {
	sandbox: T[];
	production: T[];
	key: (item: T) => string;
}) => {
	const merged = new Map<string, T>();
	for (const item of [...sandbox, ...production]) {
		const itemKey = key(item);
		if (!merged.has(itemKey)) merged.set(itemKey, item);
	}
	return [...merged.values()];
};

export function mergeEnvironments({
	sandbox,
	production,
}: {
	sandbox: EnvironmentData;
	production: EnvironmentData;
}): EnvironmentData {
	return {
		features: mergeByKey({
			sandbox: sandbox.features,
			production: production.features,
			key: (feature) => feature.id,
		}),
		plans: mergeByKey({
			sandbox: sandbox.plans,
			production: production.plans,
			key: planKey,
		}),
		rewards: mergeByKey({
			sandbox: sandbox.rewards,
			production: production.rewards,
			key: (reward) => reward.id,
		}),
		referralPrograms: mergeByKey({
			sandbox: sandbox.referralPrograms,
			production: production.referralPrograms,
			key: (program) => program.id,
		}),
	};
}
