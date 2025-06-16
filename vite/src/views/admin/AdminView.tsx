import LoadingScreen from "../general/LoadingScreen";
import { authClient } from "@/lib/auth-client";
import { DefaultView } from "../DefaultView";
import { useAdmin } from "./hooks/useAdmin";
import { toast } from "sonner";
import { AdminTable } from "./AdminTable";
import { columns as userColumns } from "./userColumns";
import { columns as orgColumns } from "./orgColumns";
import { Button } from "@/components/ui/button";

export const AdminView = () => {
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

      <div className="flex justify-end absolute top-10 right-10">
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
