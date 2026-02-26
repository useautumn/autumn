import type { Feature } from "@models/featureModels/featureModels";
import type { AppEnv } from "@models/genModels/genEnums";
import type { Organization } from "@models/orgModels/orgTable";
import type { AutumnLogger } from "./logger";

export type SharedContext = {
	// Variables
	org: Organization;
	env: AppEnv;
	features: Feature[];

	// Objects
	logger: AutumnLogger;
	expand: string[];
	// db: DrizzleCli;

	// // Info
	// id: string;
	// isPublic: boolean;
	// authType: AuthType;
	// apiVersion: ApiVersionClass;
	// timestamp: number;

	// // Query params
	// expand: string[];
	// skipCache: boolean;

	// extraLogs: Record<string, unknown>;

	// testOptions?: {
	// 	skipCacheDeletion?: boolean;
	// 	skipWebhooks?: boolean;
	// 	eventId?: string;
	// };
};
