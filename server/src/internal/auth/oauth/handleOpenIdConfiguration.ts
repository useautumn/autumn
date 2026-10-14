import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import type { Context } from "hono";
import { auth } from "@/utils/auth.js";
import { respondWithoutIssParameterSupport } from "./respondWithoutIssParameterSupport.js";

export const handleOpenIdConfiguration = (c: Context) =>
	respondWithoutIssParameterSupport({
		c,
		getMetadata: oauthProviderOpenIdConfigMetadata(auth),
	});
