import { Daytona } from "@daytonaio/sdk";
import { env as chatEnv } from "../../lib/env.js";

let cached: Daytona | undefined;

// One client per process; the SDK is stateless and connection-pooled.
export const daytonaClient = (): Daytona => {
	const apiKey = chatEnv.DAYTONA_API_KEY;
	if (!apiKey) {
		throw new Error(
			"Daytona sandbox auth missing: set DAYTONA_API_KEY (e.g. in server/.env.local).",
		);
	}
	cached ??= new Daytona({
		apiKey,
		...(chatEnv.DAYTONA_API_URL ? { apiUrl: chatEnv.DAYTONA_API_URL } : {}),
		...(chatEnv.DAYTONA_TARGET ? { target: chatEnv.DAYTONA_TARGET } : {}),
	});
	return cached;
};
