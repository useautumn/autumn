import { AppEnv } from "@autumn/shared";
import { Globe, Sliders } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { useEnv } from "@/utils/envUtils";
import { AdminOrgTable } from "@/views/admin/AdminOrgTable";
import { AdminUserTable } from "@/views/admin/AdminUserTable";
import { DefaultView } from "../DefaultView";
import LoadingScreen from "../general/LoadingScreen";
import { CreateUser } from "./components/CreateUser";
import { EdgeConfigTab } from "./components/EdgeConfigTab";
import { useAdmin } from "./hooks/useAdmin";

export const AdminView = () => {
	const navigate = useNavigate();
	const env = useEnv();
	const { isAdmin, isPending } = useAdmin();
	const adminBasePath = env === AppEnv.Sandbox ? "/sandbox/admin" : "/admin";
	const [activeTab, setActiveTab] = useState("orgs");

	if (isPending) {
		return (
			<div className="h-screen w-screen">
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
			<div className="flex justify-end absolute top-10 right-10 gap-2">
				<CreateUser />
				<Button
					onClick={() => navigate(`${adminBasePath}/edge-config`)}
					variant="outline"
					size="sm"
					className="w-fit"
				>
					<Sliders className="w-4 h-4 mr-1.5" />
					Rollouts
				</Button>
				<Button
					onClick={() => navigate(`${adminBasePath}/oauth`)}
					variant="outline"
					size="sm"
					className="w-fit"
				>
					<Globe className="w-4 h-4 mr-1.5" />
					OAuth Clients
				</Button>
				<Button
					onClick={handleStopImpersonating}
					variant="outline"
					size="sm"
					className="w-fit"
				>
					End Impersonation
				</Button>
			</div>

			<Tabs value={activeTab} onValueChange={setActiveTab}>
				<TabsList>
					<TabsTrigger value="orgs">Organizations</TabsTrigger>
					<TabsTrigger value="users">Users</TabsTrigger>
					<TabsTrigger value="edge-config">Edge Config</TabsTrigger>
				</TabsList>

				<TabsContent value="orgs" className="mt-4">
					<AdminOrgTable />
				</TabsContent>

				<TabsContent value="users" className="mt-4">
					<AdminUserTable />
				</TabsContent>

				<TabsContent value="edge-config" className="mt-4">
					<EdgeConfigTab />
				</TabsContent>
			</Tabs>
		</div>
	);
};
