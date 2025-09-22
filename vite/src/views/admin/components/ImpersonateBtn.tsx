import { Button } from "@/components/ui/button";
import { impersonateUser } from "../adminUtils";
import { User } from "better-auth";
import { useState } from "react";
import { toast } from "sonner";

export const ImpersonateButton = ({ userId }: { userId?: string }) => {
	const [loading, setLoading] = useState(false);
	if (!userId) {
		return null;
	}

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={async () => {
				setLoading(true);
				try {
					await impersonateUser(userId);
				} catch (error: any) {
					toast.error(`Failed to impersonate user: ${error.message}`);
				}
				setLoading(false);
			}}
			shimmer={loading}
		>
			Impersonate
		</Button>
	);
};
