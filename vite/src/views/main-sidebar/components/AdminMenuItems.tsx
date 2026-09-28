import { DropdownMenuItem } from "@autumn/ui";
import { LogOut, Shield } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth-client";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr, getRedirectUrl, notNullish } from "@/utils/genUtils";
import { AdminOnly } from "@/views/admin/components/AdminOnly";
import {
	ORG_MENU_ICON_CLASS,
	ORG_MENU_ICON_STROKE,
	ORG_MENU_ITEM_CLASS,
} from "./orgMenuClass";

export const AdminMenuItems = () => {
	const { data, isPending } = useSession();
	const env = useEnv();
	const [stopImpersonatingLoading, setStopImpersonatingLoading] =
		useState(false);

	const isImpersonating = notNullish(data?.session?.impersonatedBy);
	const adminPath = getRedirectUrl("/admin", env);

	const stopImpersonating = async () => {
		setStopImpersonatingLoading(true);
		try {
			await authClient.admin.stopImpersonating();
			window.location.reload();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to stop impersonation"));
		}
		setStopImpersonatingLoading(false);
	};

	if (isPending) return null;
	return (
		<AdminOnly>
			<DropdownMenuItem
				className={ORG_MENU_ITEM_CLASS}
				onClick={() => {
					window.location.href = adminPath;
				}}
			>
				<Shield
					className={ORG_MENU_ICON_CLASS}
					strokeWidth={ORG_MENU_ICON_STROKE}
				/>
				Admin
			</DropdownMenuItem>
			{isImpersonating && (
				<DropdownMenuItem
					className={ORG_MENU_ITEM_CLASS}
					onClick={async (event) => {
						event.preventDefault();
						await stopImpersonating();
					}}
					shimmer={stopImpersonatingLoading}
				>
					<LogOut
						className={ORG_MENU_ICON_CLASS}
						strokeWidth={ORG_MENU_ICON_STROKE}
					/>
					End impersonation
				</DropdownMenuItem>
			)}
		</AdminOnly>
	);
};
