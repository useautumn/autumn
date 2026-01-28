import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const createApiKeySchema = z.object({
	name: z.string().min(1, "Name is required"),
});

export const CreateApiKeyDialog = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const { refetch } = useDevQuery();
	const axiosInstance = useAxiosInstance();

	const [loading, setLoading] = useState(false);
	const [name, setName] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [copied, setCopied] = useState(false);
	const [validationError, setValidationError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			setName("");
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
				name: name,
			});

			setApiKey(api_key);
		} catch (error) {
			console.log("Error:", error);
			toast.error("Failed to create API key");
		}

		setLoading(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="transition-all duration-300"
				style={{
					maxWidth: apiKey ? "32rem" : "28rem",
					transition:
						"max-width 350ms linear(0, 0.3566, 0.7963, 1.0045, 1.0459, 1.0287, 1.0088, 0.9996, 1, 0.9987, 0.9996, 1)",
				}}
			>
				<DialogHeader>
					<DialogTitle>Create Secret API Key</DialogTitle>
					<AnimatePresence mode="wait">
						{apiKey && (
							<motion.div
								key="description"
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								transition={{
									type: "spring",
									bounce: 0.15,
									duration: 0.3,
								}}
							>
								<DialogDescription>
									Please copy your API Key and keep it somewhere safe. You won't
									be able to view it anymore after this
								</DialogDescription>
							</motion.div>
						)}
					</AnimatePresence>
				</DialogHeader>
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
								<p className="mt-2 text-sm text-red-500">{validationError}</p>
							)}
						</motion.div>
					)}
				</AnimatePresence>
				<DialogFooter>
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
							>
								<Button
									onClick={() => onOpenChange(false)}
									className="cursor-pointer"
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
							>
								<Button
									isLoading={loading}
									onClick={handleCreate}
									variant="primary"
									className="cursor-pointer"
									disabled={!!validationError || !name.trim()}
								>
									Create
								</Button>
							</motion.div>
						)}
					</AnimatePresence>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
