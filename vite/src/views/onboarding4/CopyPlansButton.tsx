import type { AgentPricingConfig } from "@autumn/shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import SmallSpinner from "@/components/general/SmallSpinner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, pushPage } from "@/utils/genUtils";

interface CopyPlansButtonProps {
	pricingConfig: AgentPricingConfig;
}

type CopyState =
	| { status: "idle" }
	| { status: "nuking"; mode: "replace" }
	| { status: "copying"; mode: "replace" | "add" };

export function CopyPlansButton({ pricingConfig }: CopyPlansButtonProps) {
	const navigate = useNavigate();
	const axiosInstance = useAxiosInstance();
	const { org, mutate: mutateOrg } = useOrg();
	const { products: existingProducts, refetch: refetchProducts } =
		useProductsQuery();

	const [copyDialogOpen, setCopyDialogOpen] = useState(false);
	const [copyState, setCopyState] = useState<CopyState>({ status: "idle" });

	const isLoading = copyState.status !== "idle";
	const isReplaceLoading =
		copyState.status !== "idle" && copyState.mode === "replace";
	const isAddLoading =
		copyState.status === "copying" && copyState.mode === "add";

	/** Execute the copy operation */
	const executeCopy = async ({ nukeFirst }: { nukeFirst: boolean }) => {
		const mode = nukeFirst ? "replace" : "add";
		try {
			// Nuke existing config if requested
			if (nukeFirst) {
				setCopyState({ status: "nuking", mode: "replace" });
				await axiosInstance.delete("/v1/configs/nuke");
			}

			// Push the new configuration
			setCopyState({ status: "copying", mode });
			await axiosInstance.post("/v1/configs/push", {
				features: pricingConfig.features,
				products: pricingConfig.products,
			});

			toast.success("Plans copied successfully");
			await refetchProducts();

			// Mark org as onboarded
			if (!org?.onboarded) {
				await axiosInstance.patch("/v1/organization", { onboarded: true });
				await mutateOrg();
			}

			setCopyDialogOpen(false);
			pushPage({ path: "/products", navigate });
		} catch (error) {
			console.error("Error copying plans:", error);
			toast.error(getBackendErr(error, "Failed to copy plans"));
		} finally {
			setCopyState({ status: "idle" });
		}
	};

	/** Handle clicking the Copy plans button */
	const handleCopyPlans = async () => {
		// If there are existing products, show the confirmation dialog
		if (existingProducts.length > 0) {
			setCopyDialogOpen(true);
			return;
		}

		// No existing products - copy directly
		await executeCopy({ nukeFirst: false });
	};

	const getReplaceButtonText = () => {
		if (copyState.status === "nuking") {
			return "Deleting existing plans and customers...";
		}
		if (copyState.status === "copying" && copyState.mode === "replace") {
			return "Copying plans...";
		}
		return "Reset sandbox and replace plans";
	};

	return (
		<>
			<Button
				variant="primary"
				size="sm"
				onClick={handleCopyPlans}
				disabled={isLoading}
			>
				{isLoading ? "Copying..." : "Copy to Autumn"}
			</Button>

			<Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Existing plans found</DialogTitle>
						<DialogDescription>
							You already have {existingProducts.length} plan
							{existingProducts.length === 1 ? "" : "s"} in your workspace. How
							would you like to proceed?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="flex-col gap-2 sm:flex-col">
						<Button
							variant="destructive"
							onClick={() => executeCopy({ nukeFirst: true })}
							disabled={isLoading}
							className="w-full"
						>
							{isReplaceLoading && <SmallSpinner size={14} />}
							{getReplaceButtonText()}
						</Button>
						<Button
							variant="secondary"
							onClick={() => executeCopy({ nukeFirst: false })}
							disabled={isLoading}
							className="w-full"
						>
							{isAddLoading && <SmallSpinner size={14} />}
							{isAddLoading
								? "Copying plans..."
								: "Keep existing and add new plans"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
