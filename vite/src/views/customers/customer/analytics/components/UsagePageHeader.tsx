import { GroupedTabButton, PageHeader } from "@autumn/ui";
import { ChartBarIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { pushPage } from "@/utils/genUtils";

type UsageTab = "overview" | "logs";

const USAGE_TAB_OPTIONS: Array<{ value: UsageTab; label: string }> = [
	{ value: "overview", label: "Overview" },
	{ value: "logs", label: "Logs" },
];

const USAGE_TAB_PATHS: Record<UsageTab, string> = {
	overview: "/analytics",
	logs: "/logs",
};

/** Shared by both Usage tabs so the title and switch never move between them. */
export const UsagePageHeader = ({
	activeTab,
	children,
}: {
	activeTab: UsageTab;
	children?: ReactNode;
}) => {
	const navigate = useNavigate();

	return (
		<PageHeader
			icon={<ChartBarIcon size={16} weight="fill" className="text-subtle" />}
			title="Usage"
			titleAccessory={
				<GroupedTabButton
					value={activeTab}
					options={USAGE_TAB_OPTIONS}
					// Each tab keeps its own filters in the URL, so don't carry them across.
					onValueChange={(value) =>
						navigate(
							pushPage({
								path: USAGE_TAB_PATHS[value as UsageTab],
								preserveParams: false,
							}),
						)
					}
				/>
			}
		>
			{children}
		</PageHeader>
	);
};
