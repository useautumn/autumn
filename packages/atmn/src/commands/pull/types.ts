import type { Feature, Plan } from "../../compose/models/index.js";
import type { AppEnv } from "../../lib/env/index.js";
import type { UpdateResult } from "../../lib/transforms/inPlaceUpdate/index.js";

/**
 * Options for pull command
 */
export interface PullOptions {
	/** Whether to generate SDK types (.d.ts) */
	generateSdkTypes?: boolean;
	/** Working directory (defaults to process.cwd()) */
	cwd?: string;
	/** Environment to pull from (defaults to AppEnv.Sandbox) */
	environment?: AppEnv;
	/** Force overwrite config file instead of in-place update */
	forceOverwrite?: boolean;
	/** Skip generating @useautumn-sdk.d.ts */
	noDeclarationFile?: boolean;
}

/**
 * Result of pull operation
 */
export interface PullResult {
	/** Features pulled from sandbox */
	features: Feature[];
	/** Plans pulled from sandbox */
	plans: Plan[];
	/** Path to generated config file */
	configPath: string;
	/** Path to generated SDK types file (if generateSdkTypes was true) */
	sdkTypesPath?: string;
	/** Whether in-place update was used */
	inPlace?: boolean;
	/** Details if in-place update was used */
	updateResult?: UpdateResult;
}

/**
 * Data fetched and transformed from an environment
 */
export interface EnvironmentData {
	features: Feature[];
	plans: Plan[];
}
