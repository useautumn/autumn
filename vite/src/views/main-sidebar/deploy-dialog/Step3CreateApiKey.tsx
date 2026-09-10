import { Button } from "@autumn/ui";
import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SectionHeader } from "@/views/onboarding3/components/integration-step/SectionHeader";
import { useCreateProdApiKey } from "./useDeployActions";

export const Step3CreateApiKey = () => {
	const { apiKey, isCreating, createApiKey } = useCreateProdApiKey();
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(apiKey);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
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
							<div className="flex justify-between bg-interactive-secondary border p-2 px-3 text-muted-foreground rounded-md items-center w-50 h-7">
								<p className="text-sm font-mono truncate">{apiKey}</p>
								<button
									type="button"
									className="text-muted-foreground hover:text-muted-foreground/80 ml-4"
									onClick={handleCopy}
								>
									{copied ? <Check size={15} /> : <Copy size={15} />}
								</button>
							</div>
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
								isLoading={isCreating}
								onClick={createApiKey}
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
