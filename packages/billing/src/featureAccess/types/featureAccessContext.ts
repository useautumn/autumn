import type { AutumnClient } from "../../types/autumnClient";

export type FeatureAccessContext = {
	autumn: Pick<AutumnClient, "check">;
	logger: { warn: (message: string, data?: Record<string, unknown>) => void };
};
