import { ShieldIcon } from "@phosphor-icons/react";
import type { PageCommand } from "@/views/command-bar/usePageCommands";

/** The admin view's tabs, deep-linked by `?tab=`. */
export const ADMIN_TABS = [
	{ id: "orgs", label: "Organizations" },
	{ id: "users", label: "Users" },
	{ id: "slack-bot", label: "Slack Bot" },
	{ id: "edge-config", label: "Edge Config" },
	{ id: "rate-limits", label: "Rate limits" },
	{ id: "queue-cron-configs", label: "Queue / Cron configs" },
	{ id: "caches", label: "Caches" },
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number]["id"];

/** The admin pages behind the admin bar's buttons. */
const ADMIN_PAGES = [
	{ title: "Shadow Atom", path: "/admin/shadow-atom" },
	{ title: "Balance worker rollout", path: "/admin/edge-config" },
	{ title: "OAuth Clients", path: "/admin/oauth" },
];

/** Command-bar entries for every admin tab and page; none for anyone but staff. */
export const adminPageCommands = ({
	isAdmin,
}: {
	isAdmin: boolean;
}): PageCommand[] => {
	if (!isAdmin) return [];
	const icon = <ShieldIcon className="size-4" />;
	return [
		...ADMIN_TABS.map((tab) => ({
			title: tab.label,
			section: "Admin",
			icon,
			path: `/admin?tab=${tab.id}`,
		})),
		...ADMIN_PAGES.map((page) => ({ ...page, section: "Admin", icon })),
	];
};
