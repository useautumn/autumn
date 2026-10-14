import type { Feature } from "@models/featureModels/featureModels";
import type { AppEnv } from "@models/genModels/genEnums";
import type { Organization } from "@models/orgModels/orgTable";
import type { AutumnLogger } from "./logger";

export type SharedContext = {
	// Variables
	/** Only what shared code reads off the org, so a caller that never holds the org row can still supply it. */
	org: Pick<Organization, "config" | "default_currency">;
	env: AppEnv;
	features: Feature[];

	// Objects
	logger: AutumnLogger;
	expand: string[];

	// // Query params
	// expand: string[];
	// skipCache: boolean;

	// testOptions?: {
	// 	skipCacheDeletion?: boolean;
	// 	skipWebhooks?: boolean;
	// 	eventId?: string;
	// };
};
