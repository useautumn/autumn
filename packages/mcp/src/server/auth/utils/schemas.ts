import * as z from "zod/v4";
import { DEFAULT_API_VERSION } from "../../../constants.js";
import type { MCPServerFlags } from "../../flags.js";

export const environmentSchema = z.enum(["sandbox", "live"]);
export type OAuthEnvironment = z.infer<typeof environmentSchema>;

export const xApiVersionSchema = z.string().default(DEFAULT_API_VERSION);

export const failOpenSchema = z
	.union([
		z.boolean(),
		z.enum(["true", "false"]).transform((v) => v === "true"),
	])
	.default(true);

export const secretKeySchema = z.string().min(1).optional();

export interface MCPOAuthFlags extends MCPServerFlags {
	readonly "oauth-enabled"?: boolean | undefined;
	readonly "oauth-environment"?: OAuthEnvironment | undefined;
}
