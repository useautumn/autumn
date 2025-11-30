import { AppEnv } from "@autumn/shared";
import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { SectionHeader } from "@/views/onboarding3/components/integration-step/SectionHeader";

export const Step3CreateApiKey = () => {
	const { refetch } = useDevQuery();
	const axiosInstance = useAxiosInstance({ env: AppEnv.Live });

	const [loading, setLoading] = useState(false);
	const [apiKey, setApiKey] = useState("");
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (copied) {
			setTimeout(() => setCopied(false), 1000);
		}
	}, [copied]);

	const handleCreate = async () => {
		setLoading(true);
		try {
			const { api_key } = await DevService.createAPIKey(axiosInstance, {
				name: "Production Secret Key",
			});

			setApiKey(api_key);
			refetch();
		} catch (error) {
			console.log("Error:", error);
			toast.error("Failed to create API key");
		}

		setLoading(false);
	};

	return (
		<div className="flex gap-3">
			<SectionHeader
				stepNumber={3}
				title="Create a production secret key"
				description="Generate a live secret key for use in your production environment"
				className="gap-0"
			/>

			<div className="pl-[32px] flex  gap-3 min-h-[70px]">
				<AnimatePresence mode="wait" initial={false}>
					{apiKey ? (
						<motion.div
							key="api-key-display"
							initial={{ opacity: 0, y: -10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 10 }}
							transition={{
								type: "spring",
								bounce: 0.15,
								duration: 0.3,
							}}
							className="flex flex-col gap-2"
						>
							<div className="flex justify-between bg-interactive-secondary border p-2 px-3 text-t2 rounded-md items-center w-36">
								<p className="text-sm font-mono truncate">{apiKey}</p>
								<button
									type="button"
									className="text-t2 hover:text-t2/80 ml-4"
									onClick={() => {
										setCopied(true);
										navigator.clipboard.writeText(apiKey);
									}}
								>
									{copied ? <Check size={15} /> : <Copy size={15} />}
								</button>
							</div>
							{/* <p className="text-xs text-t3">
								You won't be able to view this key anymore after closing the
								dialog.
							</p> */}
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
							className="flex flex-col gap-2 w-full"
						>
							<Button
								isLoading={loading}
								onClick={handleCreate}
								variant="secondary"
								className="w-36"
							>
								Generate API Key
							</Button>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
};
