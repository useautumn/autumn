import type { ChatInstallation } from "@autumn/shared";

export const isSlackAdminProvider = ({ provider }: { provider: string }) =>
	provider === "slack_admin" || provider.startsWith("slack_admin:");

export const isSlackAdminInstallation = ({
	installation,
}: {
	installation: ChatInstallation;
}) => isSlackAdminProvider({ provider: installation.provider });
