import type { Feature } from "@models/featureModels/featureModels";
import type { AppEnv } from "@models/genModels/genEnums";
import type { Organization } from "@models/orgModels/orgTable";
import type { AutumnLogger } from "./logger";

export type SharedContext = {
	org: Pick<Organization, "config" | "default_currency">;
	env: AppEnv;
	features: Feature[];

	logger: AutumnLogger;
	expand: string[];
};
