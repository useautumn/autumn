import type { ApiUsageLimit, UsageLimitFilter } from "@autumn/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

type UsageUpdate = {
	customerId: string;
	featureId: string;
	filter: UsageLimitFilter | null | undefined;
	usage: number;
};

/** Draft and save the live usage counter of a plan-inherited cap. */
export function usePlanUsageDraft({
	usageLimit,
}: {
	usageLimit: ApiUsageLimit | undefined;
}) {
	const { customer, refetch } = useCusQuery();
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const axios = useAxiosInstance();
	const currentUsage = usageLimit?.usage ?? 0;
	const [draftUsage, setDraftUsage] = useState<number | undefined>(
		currentUsage,
	);

	const customerId = customer?.id ?? customer?.internal_id;
	const isNegative = draftUsage !== undefined && draftUsage < 0;
	const isChanged = draftUsage !== undefined && draftUsage !== currentUsage;
	const pendingUpdate: UsageUpdate | undefined =
		usageLimit && customerId && isChanged && !isNegative
			? {
					customerId,
					featureId: usageLimit.feature_id,
					filter: usageLimit.filter,
					usage: draftUsage,
				}
			: undefined;

	const mutation = useMutation({
		mutationFn: ({ customerId, featureId, filter, usage }: UsageUpdate) =>
			CusService.updateCustomer({
				axios,
				customer_id: customerId,
				data: {
					billing_controls: {
						usage_limits: [
							{ feature_id: featureId, usage, ...(filter && { filter }) },
						],
					},
				},
			}),
		onSuccess: async () => {
			await refetch();
			toast.success("Usage updated");
			closeSheet();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to update usage"));
		},
	});

	const save = () => {
		if (pendingUpdate) mutation.mutate(pendingUpdate);
	};

	return {
		draftUsage,
		setDraftUsage,
		isNegative,
		canSave: pendingUpdate !== undefined,
		isSaving: mutation.isPending,
		save,
	};
}
