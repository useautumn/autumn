import { AppEnv } from "@autumn/shared";
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { SectionHeader } from "@/views/onboarding3/components/integration-step/SectionHeader";

export const Step2CopyProducts = () => {
	const sandboxAxios = useAxiosInstance({ env: AppEnv.Sandbox });
	const [isCopying, setIsCopying] = useState(false);
	const [isCopied, setIsCopied] = useState(false);

	const handleCopyProducts = async () => {
		setIsCopying(true);
		try {
			const { data } = await sandboxAxios.post("/products/copy_to_production");
			console.log("Data:", data);
			setIsCopied(true);
			toast.success(`Successfully copied products to production`);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to copy products"));
		} finally {
			setIsCopying(false);
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<SectionHeader
					stepNumber={2}
					title="Copy your products to production"
					description="Sync all your configured products and features from sandbox to production"
					className="gap-0 flex-1"
				/>
			</div>

			<div className="pl-[32px] flex flex-col gap-2">
				{isCopied ? (
					<IconButton
						variant="secondary"
						disabled
						icon={<Check size={16} className="text-green-600" />}
						className="!opacity-100"
					>
						Copied Products
					</IconButton>
				) : (
					<div>
						<Button
							variant="secondary"
							onClick={handleCopyProducts}
							isLoading={isCopying}
						>
							Copy Products
						</Button>
					</div>
				)}
			</div>
		</div>
	);
};
