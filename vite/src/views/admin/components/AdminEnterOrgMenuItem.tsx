import { DropdownMenuItem } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { useEnterOrgAsAdmin } from "../hooks/useEnterOrgAsAdmin";

export const AdminEnterOrgMenuItem = ({
	organizationId,
}: {
	organizationId: string;
}) => {
	const [loading, setLoading] = useState(false);
	const enterOrg = useEnterOrgAsAdmin();

	return (
		<DropdownMenuItem
			disabled={loading}
			isLoading={loading}
			onClick={async (event) => {
				event.stopPropagation();
				setLoading(true);
				try {
					await enterOrg(organizationId);
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
