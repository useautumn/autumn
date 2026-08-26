import { Input } from "@autumn/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const DefaultNetTermsSubsection = () => {
	const { org, mutate: refetchOrg } = useOrg();
	const axiosInstance = useAxiosInstance();
	const [draft, setDraft] = useState<string | null>(null);

	const { mutate, isPending, variables } = useMutation({
		mutationFn: async (days: number | null) => {
			await axiosInstance.patch("/organization/config", {
				default_net_terms_days: days,
			});
		},
		onSuccess: async () => {
			await refetchOrg();
			toast.success("Default net payment terms saved");
		},
		onError: () => toast.error("Failed to update default net payment terms"),
	});

	// While a save is in flight, reflect the value being saved.
	const savedDays =
		(isPending ? variables : org?.config?.default_net_terms_days) ?? null;
	const inputValue = draft ?? (savedDays === null ? "" : String(savedDays));

	const commit = () => {
		if (draft === null) return;
		const trimmed = draft.trim();
		setDraft(null);

		if (trimmed === "") {
			if (savedDays !== null) mutate(null);
			return;
		}
		const parsed = Number.parseInt(trimmed, 10);
		if (Number.isNaN(parsed) || parsed < 1) return;
		if (parsed !== savedDays) mutate(parsed);
	};

	return (
		<div className="flex items-center justify-between gap-4">
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-medium">Net payment terms</span>
				<span className="text-xs text-muted-foreground">
					{savedDays === null
						? "Unset — invoices Autumn creates are due 30 days after they're sent"
						: "Used when neither the request nor the invoice template sets its own terms"}
				</span>
			</div>
			<Input
				type="number"
				min={1}
				placeholder="30"
				aria-label="Default net payment terms in days"
				className="w-24 shrink-0"
				value={inputValue}
				disabled={isPending}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
				}}
			/>
		</div>
	);
};
