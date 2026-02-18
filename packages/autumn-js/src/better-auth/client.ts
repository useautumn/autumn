import type { BetterAuthClientPlugin } from "better-auth/client";
import type { autumn } from "./index";

type AutumnPlugin = typeof autumn;

/** Client plugin for Autumn - provides type inference for auth client */
export const autumnClient = () => {
	return {
		id: "autumn",
		$InferServerPlugin: {} as ReturnType<AutumnPlugin>,
	} satisfies BetterAuthClientPlugin;
};
