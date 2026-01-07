import { Spinner } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/v2/sheets/Sheet";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

interface ShowCustomerObjectSheetProps {
	open: boolean;
	setOpen: (open: boolean) => void;
}

const EXPAND_PARAMS = [
	"invoices",
	"trials_used",
	"rewards",
	"entities",
	"referrals",
	"payment_method",
].join(",");

export function ShowCustomerObjectSheet({
	open,
	setOpen,
}: ShowCustomerObjectSheetProps) {
	const { customer_id } = useParams();
	const axiosInstance = useAxiosInstance();

	const { data, isLoading, error } = useQuery({
		queryKey: ["customer-object", customer_id, "expanded"],
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				`/v1/customers/${customer_id}`,
			);
			return data;
		},
		enabled: open && !!customer_id,
	});

	const formattedJson = data ? JSON.stringify(data, null, 2) : "";

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex flex-col overflow-hidden bg-background min-w-xl">
				<SheetHeader>
					<SheetTitle>Customer Object</SheetTitle>
					<p className="text-t3 text-sm">
						Full customer object from GET /customers/{customer_id}
					</p>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto px-4 pb-4">
					{isLoading && (
						<div className="flex items-center justify-center py-12">
							<Spinner className="size-6 animate-spin text-t3" />
						</div>
					)}

					{error && (
						<div className="p-4 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
							{getBackendErr(error, "Failed to fetch customer")}
						</div>
					)}

					{data && (
						<CodeGroup value="response">
							<CodeGroupList>
								<CodeGroupTab value="response">Response</CodeGroupTab>
								<CodeGroupCopyButton
									onCopy={() => navigator.clipboard.writeText(formattedJson)}
								/>
							</CodeGroupList>
							<CodeGroupContent value="response" copyText={formattedJson}>
								<CodeGroupCode language="json">{formattedJson}</CodeGroupCode>
							</CodeGroupContent>
						</CodeGroup>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
