import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	type GenerateBillingTool,
	useGenerateBillingRequest,
} from "@/components/forms/shared/hooks/useGenerateBillingRequest";
import type {
	BillingGenerationState,
	BillingGenerationStatus,
} from "./BillingPromptBar";

const generationErrorMessage = (error: unknown): string => {
	if (typeof error === "object" && error !== null && "response" in error) {
		const data = (error as { response?: { data?: { message?: string } } })
			.response?.data;
		if (data?.message) return data.message;
	}
	return "Couldn't generate a configuration from that prompt";
};

/** Prompt state + generation call + error surfacing, shared by every billing
 * sheet. `onGenerated` applies the resolved V0 request to the sheet's form. */
export function useBillingGeneration({
	tool,
	customerId,
	customerProductId,
	currentRequest,
	onGenerated,
}: {
	tool: GenerateBillingTool;
	customerId: string | undefined;
	customerProductId?: string;
	currentRequest: Record<string, unknown> | null;
	onGenerated: (request: Record<string, unknown>) => void;
}): BillingGenerationState {
	const [prompt, setPrompt] = useState("");
	const [status, setStatus] = useState<BillingGenerationStatus>("idle");
	const { mutateAsync } = useGenerateBillingRequest();

	const generate = useCallback(async () => {
		const trimmedPrompt = prompt.trim();
		if (!customerId || !trimmedPrompt || status === "generating") return;

		setStatus("generating");
		try {
			const { request, unrepresentable } = await mutateAsync({
				customerId,
				...(customerProductId ? { customerProductId } : {}),
				...(currentRequest ? { currentRequest } : {}),
				prompt: trimmedPrompt,
				tool,
			});

			onGenerated(request);
			if (unrepresentable.length > 0) {
				toast.warning(`Couldn't apply: ${unrepresentable.join(", ")}`);
			}
		} catch (error) {
			toast.error(generationErrorMessage(error));
		} finally {
			setStatus("idle");
		}
	}, [
		currentRequest,
		customerId,
		customerProductId,
		mutateAsync,
		onGenerated,
		prompt,
		status,
		tool,
	]);

	return useMemo(
		() => ({ generate, prompt, setPrompt, status }),
		[generate, prompt, status],
	);
}
