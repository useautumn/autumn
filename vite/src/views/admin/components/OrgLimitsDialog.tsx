import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Skeleton,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";
import { OrgLimitsConfigForm } from "./OrgLimitsConfigForm";
import {
	ORG_LIMITS_DEFAULT_CONFIG,
	ORG_LIMITS_QUERY_KEY,
	type OrgLimitsConfig,
} from "./orgLimitsConfigTypes";

export function OrgLimitsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<OrgLimitsConfig>({
		queryKey: ORG_LIMITS_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<OrgLimitsConfig>(
				"/admin/org-limits-config",
			);
			return { ...ORG_LIMITS_DEFAULT_CONFIG, ...data };
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Org Limits</DialogTitle>
					<DialogDescription className="text-pretty">
						Raise the cap on customer products returned per query, one org at a
						time.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load org limits config"
					skeleton={
						<div className="grid grid-cols-[320px_1fr] gap-6">
							<Skeleton className="h-64" />
							<Skeleton className="h-64" />
						</div>
					}
				>
					{(config) => (
						<OrgLimitsConfigForm
							key={config.lastSuccessAt ?? "never"}
							config={config}
							onClose={() => onOpenChange(false)}
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
}
