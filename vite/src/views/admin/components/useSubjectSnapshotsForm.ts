import {
	type SubjectSnapshotsEdgeConfig,
	stampSubjectSnapshotsWrittenAfter,
} from "@autumn/edge-config/subjectSnapshots";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { edgeConfigStatusQueryKey } from "./EdgeConfigCard";
import {
	SUBJECT_SNAPSHOTS_ENDPOINT,
	SUBJECT_SNAPSHOTS_QUERY_KEY,
	type SubjectSnapshotsConfigResponse,
	subjectSnapshotsChanges,
	toSubjectSnapshotsConfig,
	toSubjectSnapshotsFormValues,
} from "./subjectSnapshotsConfig";

/** Edit, then review the old → new diff (with the server's writtenAfter stamp previewed) before anything is saved. */
export const useSubjectSnapshotsForm = ({
	config,
	onClose,
}: {
	config: SubjectSnapshotsConfigResponse;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [pending, setPending] = useState<SubjectSnapshotsEdgeConfig | null>(
		null,
	);

	const mutation = useMutation({
		mutationFn: async (next: SubjectSnapshotsEdgeConfig) => {
			await axiosInstance.put(SUBJECT_SNAPSHOTS_ENDPOINT, next);
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: SUBJECT_SNAPSHOTS_QUERY_KEY,
				}),
				queryClient.invalidateQueries({
					queryKey: edgeConfigStatusQueryKey({ configId: "subject-snapshots" }),
				}),
			]);
			toast.success("Subject snapshots config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save subject snapshots"));
		},
	});

	const form = useAppForm({
		defaultValues: toSubjectSnapshotsFormValues(config),
		onSubmit: ({ value }) => {
			setPending(
				stampSubjectSnapshotsWrittenAfter({
					previous: config.configHealthy ? config : null,
					next: toSubjectSnapshotsConfig({
						values: value,
						writtenAfter: config.writtenAfter,
					}),
					now: Date.now(),
				}),
			);
		},
	});

	return {
		form,
		pending,
		changes: pending
			? subjectSnapshotsChanges({ current: config, next: pending })
			: [],
		stampsWrittenAfter:
			pending !== null && pending.writtenAfter !== config.writtenAfter,
		isSaving: mutation.isPending,
		review: () => void form.handleSubmit(),
		backToEdit: () => setPending(null),
		save: () => {
			if (pending) mutation.mutate(pending);
		},
	};
};
