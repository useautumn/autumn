import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import type { Context } from "hono";
import { auth } from "@/utils/auth.js";
import { respondWithoutIssParameterSupport } from "./respondWithoutIssParameterSupport.js";

/**
 * The OpenID Connect document is a superset of the RFC 8414 one, so a client
 * that discovers through this route must read the same patched flag.
 */
export const handleOpenIdConfiguration = (c: Context) =>
	respondWithoutIssParameterSupport({
		c,
		getMetadata: oauthProviderOpenIdConfigMetadata(auth),
	});
