import type { ApiPlanV1 } from "@autumn/shared";

export const savedVersionPin = ({
	plans,
	planId,
}: {
	plans: ApiPlanV1[];
	planId: string;
}): number | null => {
	const saved = plans.find((plan) => plan.id === planId);
	if (!saved || saved.active) return null;
	return saved.version;
};
