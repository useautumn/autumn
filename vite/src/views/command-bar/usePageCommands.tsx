import { Scopes } from "@autumn/shared";
import { BooksIcon, ListChecksIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useScopes } from "@/hooks/useScopes";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { buildDevSubTabs } from "@/views/main-sidebar/MainSidebar";
import { FLAGGED_TABS, SETTINGS_GROUPS } from "@/views/settings/SettingsView";

export interface PageCommand {
	title: string;
	/** Groups the row under its parent page, e.g. "Settings · Members". */
	section: string;
	icon: ReactNode;
	/** In-app route; mutually exclusive with `href`. */
	path?: string;
	/** External destination, opened in a new tab. */
	href?: string;
}

/**
 * Every sub-page reachable from the sidebar, flattened for search. Both lists
 * come from the components that render them, so a new tab is searchable without
 * being registered anywhere else.
 */
export const usePageCommands = (): PageCommand[] => {
	const flags = useAutumnFlags();
	const { has } = useScopes();

	const settings = SETTINGS_GROUPS.flatMap((group) =>
		group.items
			.filter((tab) => {
				const flag = FLAGGED_TABS[tab.id];
				return flag ? Boolean(flags[flag]) : true;
			})
			.map((tab) => ({
				title: tab.label,
				section: "Settings",
				icon: tab.icon,
				path: `/settings?tab=${tab.id}`,
			})),
	);

	const developer = has(Scopes.ApiKeys.Read)
		? buildDevSubTabs({ flags }).map((tab) => ({
				title: tab.title,
				section: "Developer",
				icon: tab.icon,
				path: `/dev?tab=${tab.value}`,
			}))
		: [];

	const topLevel: PageCommand[] = [
		{
			title: "Onboarding",
			section: "Get started",
			icon: <ListChecksIcon className="size-4" />,
			path: "/onboarding",
		},
		{
			title: "Docs",
			section: "Help",
			icon: <BooksIcon className="size-4" />,
			href: "https://docs.useautumn.com",
		},
	];

	return [...topLevel, ...settings, ...developer];
};

export const usePageCommandNavigate = () => {
	const navigate = useNavigate();
	const env = useEnv();

	return ({ page }: { page: PageCommand }) => {
		if (page.href) {
			window.open(page.href, "_blank", "noopener,noreferrer");
			return;
		}
		if (page.path) navigateTo(page.path, navigate, env);
	};
};
