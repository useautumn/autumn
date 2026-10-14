import { configure } from "@trigger.dev/sdk/v3";

if (process.env.TRIGGER_SERVER_SECRET_KEY) {
	const previewBranch = process.env.TRIGGER_DEV_BRANCH?.trim();
	configure({
		secretKey: process.env.TRIGGER_SERVER_SECRET_KEY,
		baseURL: process.env.TRIGGER_API_URL,
		...(previewBranch && previewBranch !== "default" ? { previewBranch } : {}),
	});
}

export const isTriggerConfigured = (): boolean => {
	const hasAutumnKey = Boolean(process.env.TRIGGER_SERVER_SECRET_KEY);
	const hasInjectedKey = Boolean(process.env.TRIGGER_SECRET_KEY);
	if (!hasAutumnKey && !hasInjectedKey) return false;

	if (process.env.NODE_ENV === "production") return true;
	return Boolean(process.env.TRIGGER_DEV_BRANCH?.trim());
};
