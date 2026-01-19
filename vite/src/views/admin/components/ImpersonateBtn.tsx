import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { impersonateUser } from "../adminUtils";

export const ImpersonateButton = ({ userId }: { userId?: string }) => {
	const [loading, setLoading] = useState(false);
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
					await impersonateUser(userId);
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
