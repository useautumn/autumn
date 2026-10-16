import type { AutumnClient } from "../../types/autumnClient";
import type { BillingFeatureId } from "../billingFeatureIds";

type Log = (message: string, data?: Record<string, unknown>) => void;

export type FeatureAccessContext = {
	autumn: Pick<AutumnClient, "check" | "edge">;
	logger: { info: Log; warn: Log };
	/** The process's environment, which says whether the plan decides at all. */
	runtimeEnv: Record<string, string | undefined>;
	/** A test's stand-in answer per feature, which wins over everything else. */
	overrides?: Partial<Record<BillingFeatureId, boolean>>;
	/** Ask Autumn's own Atom first; the SDK falls back to the Autumn API when it's down. */
	useEdge: boolean;
};
