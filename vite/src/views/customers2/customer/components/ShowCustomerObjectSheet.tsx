import type { FullCustomer } from "@autumn/shared";
import { Spinner } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useParams } from "react-router";
import {
	CodeGroup,
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
import { VirtualizedJson } from "@/components/v2/VirtualizedJson";
import { useSheetScopeEntityId } from "@/hooks/useSheetScopeEntityId";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { EntityScopeSelector } from "../../components/sheets/EntityScopeSelector";
import { useCustomerObjectQuery } from "../hooks/useCustomerObjectQuery";

interface ShowCustomerObjectSheetProps {
	open: boolean;
	setOpen: (open: boolean) => void;
}

export function ShowCustomerObjectSheet({
	open,
	setOpen,
}: ShowCustomerObjectSheetProps) {
	const { customer_id } = useParams();

	const { customer } = useCusQuery();
	const fullCustomer = customer as FullCustomer | undefined;
	const entities = fullCustomer?.entities ?? [];
	const [scopeEntityId, setScopeEntityId] = useSheetScopeEntityId(fullCustomer);

	const { data, isLoading, error } = useCustomerObjectQuery({
		customerId: customer_id,
		scopeEntityId,
		enabled: open,
		staleTime: 0,
	});

	const formattedJson = useMemo(
		() => (data ? JSON.stringify(data, null, 2) : ""),
		[data],
	);

	const description = scopeEntityId
		? "From entities.get"
		: "From customers.get";

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex flex-col overflow-hidden bg-background sm:min-w-xl">
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
							<VirtualizedJson
								json={formattedJson}
								className="flex-1 h-0 border border-t-0 rounded-b-lg bg-white dark:bg-background py-4"
							/>
						</CodeGroup>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
