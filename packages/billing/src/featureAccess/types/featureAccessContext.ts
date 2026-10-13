import type { AutumnClient } from "../../types/autumnClient";

type Log = (message: string, data?: Record<string, unknown>) => void;

export type FeatureAccessContext = {
	autumn: Pick<AutumnClient, "check" | "edge">;
	logger: { info: Log; warn: Log };
};
