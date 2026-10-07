import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";
import { SubjectSnapshotsConfigForm } from "./SubjectSnapshotsConfigForm";
import {
	SUBJECT_SNAPSHOTS_ENDPOINT,
	SUBJECT_SNAPSHOTS_QUERY_KEY,
	type SubjectSnapshotsConfigResponse,
} from "./subjectSnapshotsConfig";

export function SubjectSnapshotsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery({
		queryKey: SUBJECT_SNAPSHOTS_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<SubjectSnapshotsConfigResponse>(
				SUBJECT_SNAPSHOTS_ENDPOINT,
			);
			return data;
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle className="text-balance">Subject Snapshots</DialogTitle>
					<DialogDescription className="text-pretty">
						How the balance worker uses the subject_snapshots table. You review
						every change before it is saved.
					</DialogDescription>
				</DialogHeader>
				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load subject snapshots config"
				>
					{(config) => (
						<SubjectSnapshotsConfigForm
							key={JSON.stringify(config)}
							config={config}
							onClose={() => onOpenChange(false)}
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
}
