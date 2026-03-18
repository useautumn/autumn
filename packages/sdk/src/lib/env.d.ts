import * as z from "zod/v4-mini";
import { SDKOptions } from "./config.js";
export interface Env {
    AUTUMN_SECRET_KEY?: string | undefined;
    /**
     * Sets the xApiVersion parameter for all supported operations
     */
    AUTUMN_X_API_VERSION?: string | undefined;
    AUTUMN_DEBUG?: boolean | undefined;
}
export declare const envSchema: z.ZodMiniType<Env, unknown>;
/**
 * Reads and validates environment variables.
 */
export declare function env(): Env;
/**
 * Clears the cached env object. Useful for testing with a fresh environment.
 */
export declare function resetEnv(): void;
/**
 * Populates global parameters with environment variables.
 */
export declare function fillGlobals(options: SDKOptions): SDKOptions;
