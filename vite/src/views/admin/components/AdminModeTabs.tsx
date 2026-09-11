import { Tabs, TabsList, TabsTrigger } from "@autumn/ui";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useAdmin } from "../hooks/useAdmin";

export type AdminMode = "regular" | "impersonate";

/**
 * Regular = see exactly what a customer sees; Impersonate = act as one of them.
 * Switching back to Regular ends any live impersonation, since the customer flow
 * is meaningless on a borrowed session.
 */
export const AdminModeTabs = ({
	mode,
	onModeChange,
}: {
	mode: AdminMode;
	onModeChange: (mode: AdminMode) => void;
}) => {
	const { isCurrentlyImpersonating } = useAdmin();

	const stopImpersonating = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.admin.stopImpersonating();
			if (error) throw new Error(error.message);
			window.location.reload();
		},
		onError: () => toast.error("Failed to end impersonation"),
	});

	const handleChange = (next: AdminMode) => {
		onModeChange(next);
		if (next === "regular" && isCurrentlyImpersonating) {
			stopImpersonating.mutate();
		}
	};

	return (
		<Tabs
			value={mode}
			onValueChange={(value) => handleChange(value as AdminMode)}
		>
			<TabsList className="w-full h-8 border border-border bg-card">
				<TabsTrigger
					value="regular"
					className="flex-1 text-xs"
					disabled={stopImpersonating.isPending}
				>
					Regular
				</TabsTrigger>
				<TabsTrigger value="impersonate" className="flex-1 text-xs">
					Impersonate
				</TabsTrigger>
			</TabsList>
		</Tabs>
	);
};
