import type { Entity, FullCustomer } from "@autumn/shared";
import { LATEST_VERSION } from "@autumn/shared";
import { Button, FormLabel, Input, ShortcutButton } from "@autumn/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSheetScopeEntityId } from "@/hooks/useSheetScopeEntityId";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { EntityScopeSelector } from "./EntityScopeSelector";
import {
	CheckAdvancedSection,
	type CheckLockConfig,
	DEFAULT_CHECK_LOCK_CONFIG,
} from "./lock/CheckAdvancedSection";

export function CheckBalanceSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetData = useSheetStore((s) => s.data);
	const { customer } = useCusQuery();
	const [scopeEntityId, setScopeEntityId] = useSheetScopeEntityId(
		customer as FullCustomer | undefined,
	);
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const queryClient = useQueryClient();

	const fullCustomer = customer as FullCustomer | null;
	const entities = fullCustomer?.entities || [];
	const fullEntity = entities.find(
		(e: Entity) => e.id === scopeEntityId || e.internal_id === scopeEntityId,
	);

	const featureId = sheetData?.featureId as string | undefined;
	const featureName = sheetData?.featureName as string | undefined;
	const customerId = customer?.id || customer?.internal_id;

	const [requiredBalance, setRequiredBalance] = useState("1");
	const [lock, setLock] = useState<CheckLockConfig>(DEFAULT_CHECK_LOCK_CONFIG);
	const [response, setResponse] = useState<unknown>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async () => {
		if (!customerId || !featureId) return;

		const parsedRequiredBalance =
			requiredBalance.trim() === "" ? 1 : Number.parseFloat(requiredBalance);
		if (Number.isNaN(parsedRequiredBalance)) {
			toast.error("Please enter a valid number for required balance");
			return;
		}
		if (lock.enabled && !lock.lockId.trim()) {
			toast.error("Please enter a lock ID");
			return;
		}

		const params: Record<string, unknown> = {
			customer_id: customerId,
			feature_id: featureId,
			required_balance: parsedRequiredBalance,
		};
		if (scopeEntityId) params.entity_id = scopeEntityId;
		if (lock.enabled) {
			params.lock = {
				enabled: true,
				lock_id: lock.lockId.trim(),
				overage_behavior: lock.overageBehavior,
			};
		}

		setIsSubmitting(true);
		try {
			const { data } = await axiosInstance.post("/v1/check", params);
			setResponse(data);
			if (lock.enabled) {
				toast.success(
					data?.allowed
						? `Locked ${parsedRequiredBalance} with ID ${lock.lockId.trim()}`
						: "Check denied, nothing was locked",
				);
				await queryClient.invalidateQueries({ queryKey: ["customer"] });
			}
		} catch (err) {
			toast.error(getBackendErr(err, "Failed to check balance"));
		} finally {
			setIsSubmitting(false);
		}
	};

	const formattedJson = response ? JSON.stringify(response, null, 2) : "";

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-hidden">
				<SheetHeader
					title="Check Balance"
					description={
						scopeEntityId
							? `Checking balance for entity ${fullEntity?.name || scopeEntityId}`
							: `POST /check for ${featureName ?? featureId}`
					}
				/>

				{entities.length > 0 && (
					<EntityScopeSelector
						entities={entities}
						scopeEntityId={scopeEntityId}
						onScopeChange={setScopeEntityId}
					/>
				)}

				<SheetSection withSeparator>
					<FormLabel>Required balance</FormLabel>
					<Input
						placeholder="1"
						type="number"
						value={requiredBalance}
						onChange={(e) => setRequiredBalance(e.target.value)}
					/>
				</SheetSection>

				<CheckAdvancedSection lock={lock} onLockChange={setLock} />

				<div className="flex-1 overflow-hidden flex flex-col px-4 py-4">
					{response ? (
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
					) : (
						<p className="text-xs text-tertiary-foreground">
							{lock.enabled
								? "Running this check reserves the required balance until the lock is finalized."
								: "Run the check to see the response."}
						</p>
					)}
				</div>

				<SheetFooter>
					<Button
						variant="secondary"
						className="w-full"
						onClick={closeSheet}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<ShortcutButton
						variant="primary"
						className="w-full"
						onClick={handleSubmit}
						isLoading={isSubmitting}
						metaShortcut="enter"
					>
						{lock.enabled ? "Check & lock" : "Check"}
					</ShortcutButton>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
