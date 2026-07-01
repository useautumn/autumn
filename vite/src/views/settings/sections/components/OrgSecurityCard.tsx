import type { FrontendOrg, OrgConfig } from "@autumn/shared";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Switch,
} from "@autumn/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { useCurrentMembership } from "@/views/main-sidebar/org-dropdown/hooks/useCurrentMembership";

/**
 * Org-wide security toggles. Today this is just "require passkey" — owners
 * can flip it on to lock the org behind passkey auth. The toggle writes via
 * the existing `/organization/config` PATCH endpoint, which the server uses
 * along with `beforeSessionUpdated` to gate org switching.
 *
 * Owner-only intentionally: a regular admin can't fence other members out.
 */
export const OrgSecurityCard = () => {
	const { org } = useOrg();
	const { isOwner } = useCurrentMembership();
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const env = useEnv();
	const activeOrgId = org?.id;
	const queryKey = ["org", env, activeOrgId];

	const requirePasskey = org?.config?.require_passkey === true;

	const { mutate, isPending } = useMutation({
		mutationFn: async (value: boolean) => {
			const { data } = await axiosInstance.patch("/organization/config", {
				require_passkey: value,
			});
			return data as { config: OrgConfig };
		},
		onSuccess: (data, value) => {
			queryClient.setQueryData<FrontendOrg>(queryKey, (old) =>
				old ? { ...old, config: data.config } : old,
			);
			// Also refresh better-auth's org list so the gate badge in the
			// switcher reflects the new state without a page reload.
			queryClient.invalidateQueries({ queryKey: ["organization-members"] });
			toast.success(
				value
					? "Passkeys are now required for this organization"
					: "Passkey requirement removed",
			);
		},
		onError: () => {
			toast.error("Failed to update security settings");
			queryClient.invalidateQueries({ queryKey });
		},
	});

	if (!org) return null;

	return (
		<Card className="shadow-none bg-interactive-secondary">
			<CardHeader>
				<CardTitle>Security</CardTitle>
				<CardDescription>
					Lock down how members of this organization sign in
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-start gap-3">
						<div className="rounded-md bg-muted/50 p-2 mt-0.5">
							<KeyRound size={14} className="text-muted-foreground" />
						</div>
						<div className="flex flex-col gap-0.5">
							<span className="text-sm font-medium">Require passkeys</span>
							<span className="text-xs text-muted-foreground">
								Members without a passkey can't select this organization.
								They keep access to their other orgs.
							</span>
							{!isOwner && (
								<span className="text-xs text-tertiary-foreground italic mt-1">
									Only the organization owner can change this.
								</span>
							)}
						</div>
					</div>
					<Switch
						checked={requirePasskey}
						onCheckedChange={(value) => mutate(value)}
						disabled={isPending || !isOwner}
					/>
				</div>
			</CardContent>
		</Card>
	);
};
