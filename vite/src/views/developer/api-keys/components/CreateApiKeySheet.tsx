import type { ScopeString } from "@autumn/shared";
import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { ScopeSelector } from "@/components/v2/scope-selector";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/v2/sheets/Sheet";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import { useSession } from "@/lib/auth-client";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const createApiKeySchema = z.object({
	name: z.string().min(1, "Name is required"),
});

export const CreateApiKeySheet = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const { refetch } = useDevQuery();
	const axiosInstance = useAxiosInstance();
	const { data: session } = useSession();
	// better-auth's TS inference doesn't auto-propagate customSession
	// additions in all setups, so we cast — this mirrors the server-side
	// `betterAuthMiddleware` pattern.
	const callerScopes = (((session as any)?.scopes ?? []) as string[]);

	const [loading, setLoading] = useState(false);
	const [name, setName] = useState("");
	const [scopes, setScopes] = useState<ScopeString[]>([]);
	const [apiKey, setApiKey] = useState("");
	const [copied, setCopied] = useState(false);
	const [validationError, setValidationError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			setName("");
			setScopes([]);
			setApiKey("");
			setCopied(false);
			setValidationError(null);
		} else if (!open) {
			refetch();
			setTimeout(() => {
				setApiKey("");
			}, 500);
		}
	}, [open, refetch]);

	useEffect(() => {
		const result = createApiKeySchema.safeParse({ name });
		if (!result.success) {
			setValidationError(result.error.issues[0]?.message || null);
		} else {
			setValidationError(null);
		}
	}, [name]);

	useEffect(() => {
		if (copied) {
			setTimeout(() => setCopied(false), 1000);
		}
	}, [copied]);

	const handleCreate = async () => {
		const result = createApiKeySchema.safeParse({ name });
		if (!result.success) {
			setValidationError(result.error.issues[0]?.message || null);
			return;
		}

		setLoading(true);
		try {
			const { api_key } = await DevService.createAPIKey(axiosInstance, {
				name,
				scopes,
			});

			setApiKey(api_key);
		} catch (error: any) {
			console.log("Error:", error);
			if (error?.response?.status === 403) {
				toast.error("You can't grant scopes you don't have yourself.");
			} else {
				toast.error(
					error?.response?.data?.message ?? "Failed to create API key",
				);
			}
		}

		setLoading(false);
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			{/*
			  Width matches the canonical app-wide sheet width: 28rem
			  (see `CustomerSheets.tsx` — all inline sheets animate to
			  28rem on desktop). The Radix Sheet default is narrower; we
			  set min+max so the content matches the other sheets visually.
			*/}
			<SheetContent
				side="right"
				className="!w-[28rem] !max-w-[28rem] sm:!w-[28rem] sm:!max-w-[28rem]"
			>
				<SheetHeader>
					<SheetTitle>Create Secret API Key</SheetTitle>
					<AnimatePresence mode="wait">
						{apiKey && (
							<motion.p
								key="description"
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								transition={{
									type: "spring",
									bounce: 0.15,
									duration: 0.3,
								}}
								className="text-muted-foreground text-sm"
							>
								Please copy your API Key and keep it somewhere safe. You
								won't be able to view it anymore after this
							</motion.p>
						)}
					</AnimatePresence>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto px-4 pb-4">
					<AnimatePresence mode="wait" initial={false}>
						{apiKey ? (
							<motion.div
								key="api-key"
								initial={{ opacity: 0, y: -10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 10 }}
								transition={{
									type: "spring",
									bounce: 0.15,
									duration: 0.3,
								}}
								className="flex justify-between bg-input/50 dark:bg-input/30 p-2 px-3 text-t2 rounded-md items-center"
							>
								<p className="text-sm">{apiKey}</p>
								<button
									type="button"
									className="text-t2 hover:text-t2/80 cursor-pointer"
									onClick={() => {
										setCopied(true);
										navigator.clipboard.writeText(apiKey);
									}}
								>
									{copied ? <Check size={15} /> : <Copy size={15} />}
								</button>
							</motion.div>
						) : (
							<motion.div
								key="name-input"
								initial={{ opacity: 0, y: -10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 10 }}
								transition={{
									type: "spring",
									bounce: 0.15,
									duration: 0.3,
								}}
							>
								<p className="mb-2 text-sm text-t3">Name</p>
								<Input
									placeholder="Name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									variant={validationError ? "destructive" : undefined}
									onKeyDown={(e) => {
										if (
											e.key === "Enter" &&
											name.trim() &&
											!loading &&
											!validationError
										) {
											e.preventDefault();
											handleCreate();
										}
									}}
								/>
								{validationError && (
									<p className="mt-2 text-sm text-red-500">
										{validationError}
									</p>
								)}

								<div className="mt-6">
									<ScopeSelector
										value={scopes}
										onChange={setScopes}
										availableScopes={callerScopes}
										disabled={loading}
									/>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				{/*
				  Footer matches the app-wide sheet pattern
				  (see `InvoiceDetailSheet.tsx`):
				    - `sticky bottom-0 p-4 flex gap-2 bg-card`
				    - Buttons take `flex-1` so they share the row evenly.
				*/}
				<div className="sticky bottom-0 p-4 flex gap-2 bg-card">
					<AnimatePresence mode="wait" initial={false}>
						{apiKey ? (
							<motion.div
								key="close-button"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{
									type: "spring",
									bounce: 0.15,
									duration: 0.2,
								}}
								className="flex flex-1"
							>
								<Button
									variant="primary"
									onClick={() => onOpenChange(false)}
									className="flex-1"
								>
									Close
								</Button>
							</motion.div>
						) : (
							<motion.div
								key="create-button"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{
									type: "spring",
									bounce: 0.15,
									duration: 0.2,
								}}
								className="flex flex-1 gap-2"
							>
								<Button
									variant="secondary"
									onClick={() => onOpenChange(false)}
									className="flex-1"
									disabled={loading}
								>
									Cancel
								</Button>
								<Button
									isLoading={loading}
									onClick={handleCreate}
									variant="primary"
									className="flex-1"
									disabled={!!validationError || !name.trim()}
								>
									Create key
								</Button>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</SheetContent>
		</Sheet>
	);
};
