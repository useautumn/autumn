import { LATEST_VERSION } from "@autumn/shared";
import { Spinner } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import {
	LayoutGroup,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "../../customer/CustomerContext";

export function CheckBalanceSheet() {
	const sheetData = useSheetStore((s) => s.data);
	const { customer } = useCusQuery();
	const { entityId } = useCustomerContext();
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const buildKey = useQueryKeyFactory();

	const featureId = sheetData?.featureId as string | undefined;
	const featureName = sheetData?.featureName as string | undefined;
	const customerId = customer?.id || customer?.internal_id;

	const { data, isLoading, error } = useQuery({
		queryKey: buildKey(["check-balance", customerId, featureId, entityId]),
		queryFn: async () => {
			const params: Record<string, unknown> = {
				customer_id: customerId,
				feature_id: featureId,
			};
			if (entityId) params.entity_id = entityId;

			const { data } = await axiosInstance.post("/v1/check", params);
			return data;
		},
		enabled: !!customerId && !!featureId,
		gcTime: 0,
		staleTime: 0,
	});

	const formattedJson = data ? JSON.stringify(data, null, 2) : "";

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-hidden">
				<SheetHeader
					title="Check Balance"
					description={`POST /check for ${featureName ?? featureId}`}
				/>

				<div className="flex-1 overflow-hidden flex flex-col px-4 pb-4">
					{isLoading && (
						<div className="flex items-center justify-center py-12">
							<Spinner className="size-6 animate-spin text-t3" />
						</div>
					)}

					{error && (
						<div className="p-4 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
							{getBackendErr(error, "Failed to check balance")}
						</div>
					)}

					{data && (
						<CodeGroup value="response" className="flex-1 h-0 flex flex-col">
							<CodeGroupList>
								<CodeGroupTab value="response">Response</CodeGroupTab>
								<CodeGroupCopyButton
									onCopy={() => navigator.clipboard.writeText(formattedJson)}
								/>
							</CodeGroupList>
							<div className="flex-1 h-0 overflow-y-auto border border-t-0 rounded-b-lg bg-white dark:bg-background p-4">
								<CodeGroupCode language="json">{formattedJson}</CodeGroupCode>
							</div>
						</CodeGroup>
					)}
				</div>
			</div>
		</LayoutGroup>
	);
}
