import { Button } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { impersonateUser } from "../adminUtils";
import { useAdmin } from "../hooks/useAdmin";

export const ImpersonateButton = ({
	userId,
	organizationId,
}: {
	userId?: string;
	organizationId?: string;
}) => {
	const [loading, setLoading] = useState(false);
	const { isCurrentlyImpersonating } = useAdmin();
	if (!userId) {
		return null;
	}

	return (
		<Button
			variant="secondary"
			size="sm"
			onClick={async () => {
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
				}
				setLoading(false);
			}}
			isLoading={loading}
		>
			Impersonate
		</Button>
	);
};
