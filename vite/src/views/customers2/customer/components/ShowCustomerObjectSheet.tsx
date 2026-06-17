import type { FullCustomer } from "@autumn/shared";
import { LATEST_VERSION } from "@autumn/shared";
import { Spinner } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import {
	CodeGroup,
	CodeGroupCode,
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
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { EntityScopeSelector } from "../../components/sheets/EntityScopeSelector";

interface ShowCustomerObjectSheetProps {
	open: boolean;
	setOpen: (open: boolean) => void;
}

const CUSTOMER_EXPAND_PARAMS = [
	"invoices",
	"trials_used",
	"rewards",
	"entities",
	"referrals",
	"payment_method",
	"billing_controls.auto_topups.purchase_limit",
].join(",");

const ENTITY_EXPAND_PARAMS = "invoices";

export function ShowCustomerObjectSheet({
	open,
	setOpen,
}: ShowCustomerObjectSheetProps) {
	const { customer_id } = useParams();
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const buildKey = useQueryKeyFactory();

	const { customer } = useCusQuery();
	const fullCustomer = customer as FullCustomer | undefined;
	const entities = fullCustomer?.entities ?? [];
	const [scopeEntityId, setScopeEntityId] = useState<string | undefined>(
		undefined,
	);

	const { data, isLoading, error } = useQuery({
		queryKey: buildKey(["customer-object", customer_id, scopeEntityId]),
		queryFn: async () => {
			const url = scopeEntityId
				? `/v1/customers/${customer_id}/entities/${scopeEntityId}?expand=${ENTITY_EXPAND_PARAMS}`
				: `/v1/customers/${customer_id}?expand=${CUSTOMER_EXPAND_PARAMS}`;
			const { data } = await axiosInstance.get(url);
			return data;
		},
		enabled: open && !!customer_id,
		gcTime: 0,
		staleTime: 0,
	});

	const formattedJson = data ? JSON.stringify(data, null, 2) : "";

	const description = scopeEntityId
		? "From entities.get"
		: "From customers.get";

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex flex-col overflow-hidden bg-background min-w-xl">
				<SheetHeader>
					<SheetTitle>
						{scopeEntityId ? "Entity Object" : "Customer Object"}
					</SheetTitle>
					<p className="text-tertiary-foreground text-sm">{description}</p>
				</SheetHeader>

				{entities.length > 0 && (
					<EntityScopeSelector
						entities={entities}
						scopeEntityId={scopeEntityId}
						onScopeChange={setScopeEntityId}
					/>
				)}

				<div className="flex-1 overflow-hidden flex flex-col px-4 pb-4">
					{isLoading && (
						<div className="flex items-center justify-center py-12">
							<Spinner className="size-6 animate-spin text-tertiary-foreground" />
						</div>
					)}

					{error && (
						<div className="p-4 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
							{getBackendErr(error, "Failed to fetch customer")}
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
			</SheetContent>
		</Sheet>
	);
}
