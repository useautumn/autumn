import { Globe } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { DefaultView } from "../DefaultView";
import LoadingScreen from "../general/LoadingScreen";
import { AdminTable } from "./AdminTable";
import { CreateUser } from "./components/CreateUser";
import { useAdmin } from "./hooks/useAdmin";
import { columns as orgColumns } from "./orgColumns";
import { columns as userColumns } from "./userColumns";

export const AdminView = () => {
	const navigate = useNavigate();
	const { isAdmin, isPending } = useAdmin();

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
		const { data, error } = await authClient.admin.stopImpersonating();

		if (error) {
			toast.error("Something went wrong");
			return;
		}

		window.location.reload();
	};

	return (
		<div className="flex flex-col p-6">
			{/* 1. User list */}

			<div className="flex justify-end absolute top-10 right-10 gap-2">
				<CreateUser />
				<Button
					onClick={() => navigate("/admin/oauth")}
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

			<div className="text-xs">
				<AdminTable path="/admin/users" columns={userColumns} title="Users" />
				<AdminTable path="/admin/orgs" columns={orgColumns} title="Orgs" />
			</div>
		</div>
	);
};
