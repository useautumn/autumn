import { isSecretKeyPrefix } from "@autumn/auth";
import type { AppEnv } from "@autumn/shared";

export const autumnMcpHeaders = ({
	appEnv,
	token,
}: {
	appEnv: AppEnv;
	token: string;
}) => {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		"x-autumn-environment": appEnv,
	};
	if (isSecretKeyPrefix({ token })) {
		headers["secret-key"] = token;
	}
	return headers;
};
