import { DropdownMenuItem } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { impersonateUser } from "../adminUtils";
import { useAdmin } from "../hooks/useAdmin";

export const AdminImpersonateMenuItem = ({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId?: string;
}) => {
	const [loading, setLoading] = useState(false);
	const { isCurrentlyImpersonating } = useAdmin();

	return (
		<DropdownMenuItem
			disabled={loading}
			isLoading={loading}
			onClick={async (event) => {
				event.stopPropagation();
				setLoading(true);
				try {
					await impersonateUser({
						userId,
						organizationId,
						isCurrentlyImpersonating,
					});
				} catch (error: unknown) {
					const errorMessage =
						error instanceof Error ? error.message : "Unknown error";
					toast.error(`Failed to impersonate user: ${errorMessage}`);
					setLoading(false);
				}
			}}
		>
			Impersonate
		</DropdownMenuItem>
	);
};
