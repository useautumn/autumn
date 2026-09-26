import {
	Button,
	Switch,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@autumn/ui";
import { Globe, Sliders } from "@phosphor-icons/react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useEnv } from "@/utils/envUtils";
import { getRedirectUrl } from "@/utils/genUtils";
import { AdminOrgTable } from "@/views/admin/AdminOrgTable";
import { AdminUserTable } from "@/views/admin/AdminUserTable";
import { DefaultView } from "../DefaultView";
import LoadingScreen from "../general/LoadingScreen";
import { CachesTab } from "./components/CachesTab";
import { CreateUser } from "./components/CreateUser";
import { EdgeConfigTab } from "./components/EdgeConfigTab";
import { QueueCronConfigsTab } from "./components/QueueCronConfigsTab";
import { SlackAdminBotTab } from "./components/SlackAdminBotTab";
import { useAdmin } from "./hooks/useAdmin";

const ADMIN_TAB_IDS = [
	"orgs",
	"users",
	"slack-bot",
	"edge-config",
	"queue-cron-configs",
	"caches",
] as const;

type AdminTab = (typeof ADMIN_TAB_IDS)[number];

export const AdminView = () => {
	const navigate = useNavigate();
	const env = useEnv();
	const { isAdmin, isPending, adminHoverEnabled, setAdminHoverEnabled } =
		useAdmin();
	const adminBasePath = getRedirectUrl("/admin", env);
	const [activeTab, setActiveTab] = useQueryState<AdminTab>(
		"tab",
		parseAsStringLiteral(ADMIN_TAB_IDS).withDefault("orgs"),
	);

	if (isPending) {
		return (
			<div className="h-dvh w-screen">
				<LoadingScreen />
			</div>
		);
	}

	if (!isAdmin) {
		return <DefaultView />;
	}

	const handleStopImpersonating = async () => {
		const { error } = await authClient.admin.stopImpersonating();

		if (error) {
			toast.error("Something went wrong");
			return;
		}

		window.location.reload();
	};

	return (
		<div className="flex flex-col p-6 gap-8">
			<div className="flex flex-wrap justify-end gap-2">
				<CreateUser />
				<Button
					onClick={() => navigate(`${adminBasePath}/edge-config`)}
					variant="secondary"
					size="sm"
					className="w-fit"
				>
					<Sliders className="w-4 h-4 mr-1.5" />
					Rollouts
				</Button>
				<Button
					onClick={() => navigate(`${adminBasePath}/oauth`)}
					variant="secondary"
					size="sm"
					className="w-fit"
				>
					<Globe className="w-4 h-4 mr-1.5" />
					OAuth Clients
				</Button>
				<Button
					onClick={handleStopImpersonating}
					variant="secondary"
					size="sm"
					className="w-fit"
				>
					End Impersonation
				</Button>
			</div>

			<Tabs
				value={activeTab}
				onValueChange={(value) => setActiveTab(value as AdminTab)}
			>
				<div className="flex items-center justify-between gap-4">
					<TabsList className="min-w-0 max-w-full justify-start overflow-x-auto">
						<TabsTrigger value="orgs">Organizations</TabsTrigger>
						<TabsTrigger value="users">Users</TabsTrigger>
						<TabsTrigger value="slack-bot">Slack Bot</TabsTrigger>
						<TabsTrigger value="edge-config">Edge Config</TabsTrigger>
						<TabsTrigger value="queue-cron-configs">
							Queue / Cron configs
						</TabsTrigger>
						<TabsTrigger value="caches">Caches</TabsTrigger>
					</TabsList>
					<div className="flex shrink-0 items-center gap-2">
						<Switch
							id="admin-hover-toggle"
							checked={adminHoverEnabled}
							onCheckedChange={setAdminHoverEnabled}
						/>
						<label
							htmlFor="admin-hover-toggle"
							className="text-sm text-foreground"
						>
							Admin hover
						</label>
					</div>
				</div>

				<TabsContent value="orgs" className="mt-4">
					<AdminOrgTable />
				</TabsContent>

				<TabsContent value="users" className="mt-4">
					<AdminUserTable />
				</TabsContent>

				<TabsContent value="slack-bot" className="mt-4">
					<SlackAdminBotTab />
				</TabsContent>

				<TabsContent value="edge-config" className="mt-4">
					<EdgeConfigTab />
				</TabsContent>

				<TabsContent value="queue-cron-configs" className="mt-4">
					<QueueCronConfigsTab />
				</TabsContent>

				<TabsContent value="caches" className="mt-4">
					<CachesTab />
				</TabsContent>
			</Tabs>
		</div>
	);
};
