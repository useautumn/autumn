import { DropdownMenuItem } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { enterOrgAsAdmin } from "../adminUtils";
import { useAdmin } from "../hooks/useAdmin";

export const AdminEnterOrgMenuItem = ({
	organizationId,
}: {
	organizationId: string;
}) => {
	const [loading, setLoading] = useState(false);
	const { isCurrentlyImpersonating } = useAdmin();
	const axiosInstance = useAxiosInstance();

	return (
		<DropdownMenuItem
			disabled={loading}
			isLoading={loading}
			onClick={async (event) => {
				event.stopPropagation();
				setLoading(true);
				try {
					await enterOrgAsAdmin({
						axiosInstance,
						organizationId,
						isCurrentlyImpersonating,
					});
					window.location.reload();
				} catch (error: unknown) {
					toast.error(getBackendErr(error, "Failed to enter organization"));
					setLoading(false);
				}
			}}
		>
			Enter as admin
		</DropdownMenuItem>
	);
};
