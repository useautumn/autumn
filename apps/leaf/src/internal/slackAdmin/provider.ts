import type { ChatInstallation } from "@autumn/shared";

export const isInternalAutumnSlackProvider = ({ provider }: { provider: string }) =>
	provider === "slack_admin" || provider.startsWith("slack_admin:");

export const isInternalAutumnSlackInstallation = ({
	installation,
}: {
	installation: ChatInstallation;
}) => isInternalAutumnSlackProvider({ provider: installation.provider });
