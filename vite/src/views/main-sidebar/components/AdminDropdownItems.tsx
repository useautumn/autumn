import { AdminOnly } from "@/views/admin/components/AdminOnly";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { authClient, useSession } from "@/lib/auth-client";
import { getBackendErr, notNullish } from "@/utils/genUtils";
import { toast } from "sonner";
import { useState } from "react";
import { LogOut, Shield } from "lucide-react";

export const AdminDropdownItems = () => {
	const { data, isPending } = useSession();

	const [stopImpersonatingLoading, setStopImpersonatingLoading] =
		useState(false);
	const isImpersonating = notNullish(data?.session?.impersonatedBy);

	if (isPending) return null;
	return (
		<AdminOnly>
			{isImpersonating && (
				<DropdownMenuItem
					onClick={async (e) => {
						e.preventDefault();
						setStopImpersonatingLoading(true);
						try {
							await authClient.admin.stopImpersonating();
							window.location.reload();
						} catch (error) {
							toast.error(getBackendErr(error, "Failed to stop impersonation"));
						}
						setStopImpersonatingLoading(false);
					}}
					shimmer={stopImpersonatingLoading}
				>
					<div className="flex justify-between w-full items-center gap-2 text-t2">
						<span>End Impersonation</span>
						<LogOut size={12} />
					</div>
				</DropdownMenuItem>
			)}
			<DropdownMenuItem
				onClick={() => {
					window.location.href = "/admin";
				}}
			>
				<div className="flex justify-between w-full items-center gap-2 text-t2">
					Admin
					<Shield size={12} />
				</div>
			</DropdownMenuItem>
			<DropdownMenuSeparator />
		</AdminOnly>
	);
};
