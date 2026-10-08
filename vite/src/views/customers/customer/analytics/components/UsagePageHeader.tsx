import { PageHeader, Tabs, TabsList, TabsTrigger } from "@autumn/ui";
import { ChartBarIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { pushPage } from "@/utils/genUtils";

type UsageTab = "overview" | "logs";

const USAGE_TABS: Array<{ value: UsageTab; label: string }> = [
	{ value: "overview", label: "Overview" },
	{ value: "logs", label: "Logs" },
];

const USAGE_TAB_PATHS: Record<UsageTab, string> = {
	overview: "/analytics",
	logs: "/logs",
};

/** Shared by both Usage tabs so the title and tabs never move between them. */
export const UsagePageHeader = ({
	activeTab,
	children,
}: {
	activeTab: UsageTab;
	children?: ReactNode;
}) => {
	const navigate = useNavigate();

	return (
		<div className="flex flex-col gap-1">
			<PageHeader
				icon={<ChartBarIcon size={16} weight="fill" className="text-subtle" />}
				title="Usage"
			>
				{children}
			</PageHeader>
			<Tabs
				value={activeTab}
				// Each tab keeps its own filters in the URL, so don't carry them across.
				onValueChange={(value: UsageTab) =>
					navigate(
						pushPage({ path: USAGE_TAB_PATHS[value], preserveParams: false }),
					)
				}
			>
				<TabsList variant="underline">
					{USAGE_TABS.map((tab) => (
						<TabsTrigger key={tab.value} value={tab.value} variant="underline">
							{tab.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
		</div>
	);
};
