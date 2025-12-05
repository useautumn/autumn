import { AppEnv } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { WarningBox } from "@/components/general/modal-components/WarningBox";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
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
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useSyncPreview } from "./useSyncPreview";

type SyncEnvironmentDialogProps = {
	open: boolean;
	setOpen: (open: boolean) => void;
	from: AppEnv;
	to: AppEnv;
};

export const SyncEnvironmentDialog = (props: SyncEnvironmentDialogProps) => {
	const axiosInstance = useAxiosInstance();
	const [isLoading, setIsLoading] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const { data: preview, isLoading: previewLoading } = useSyncPreview({
		enabled: props.open,
		from: props.from,
	});

	const targetEnvName = props.to === AppEnv.Live ? "Production" : "Sandbox";
	const sourceEnvName = props.from === AppEnv.Live ? "Production" : "Sandbox";
	const confirmWord = targetEnvName.toLowerCase();

	const handleSync = async () => {
		if (confirmText !== confirmWord) {
			toast.error("Confirmation text is incorrect");
			return;
		}

		setIsLoading(true);
		try {
			await axiosInstance.post("/products/copy_to_production", { from: props.from });
			toast.success(`Successfully synced to ${targetEnvName}`);
			props.setOpen(false);
			setConfirmText("");
		} catch (error) {
			toast.error("Failed to sync environments");
			console.error("Sync error:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (!isLoading) {
			props.setOpen(newOpen);
			if (!newOpen) {
				setConfirmText("");
			}
		}
	};

	const p = preview?.products;
	const f = preview?.features;
	const hasChangesToSync = (p?.new?.length ?? 0) > 0 || (p?.updated?.length ?? 0) > 0 || (f?.new?.length ?? 0) > 0;

	return (
		<Dialog open={props.open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader className="max-w-full">
					<DialogTitle>Sync to {targetEnvName}</DialogTitle>
					<DialogDescription className="max-w-[400px] break-words flex flex-col gap-3">
						<p>
							Sync all products and features from {sourceEnvName} to{" "}
							{targetEnvName}?
						</p>
						{!previewLoading && (
							<>
								{!hasChangesToSync && <p>Everything is already in sync.</p>}
								{preview?.products?.targetOnly?.map((product) => (
									<WarningBox key={product.id}>
										{product.name} exists in {targetEnvName} but not in {sourceEnvName}. You may want to
										archive it.
									</WarningBox>
								))}
								{preview?.defaultConflict && (
									<WarningBox>
										Default product conflict: "{preview.defaultConflict.source}" in {sourceEnvName} vs "
										{preview.defaultConflict.target}" in {targetEnvName}.
									</WarningBox>
								)}
								{preview?.customersAffected?.map((c) => (
									<WarningBox key={c.productId}>
										{c.customerCount} customer{c.customerCount === 1 ? "" : "s"} on product{" "}
										{c.productName} will remain on the old version until migrated.
									</WarningBox>
								))}
								{p?.new?.map((product) => {
									const changes = product.changes;
									const changeCount = changes
										? changes.newItems.length +
											(changes.priceChange ? 1 : 0) +
											(changes.defaultChange ? 1 : 0) +
											(changes.freeTrialChange ? 1 : 0)
										: 0;
									if (changeCount === 0) {
										return (
											<div key={product.id} className="text-sm">
												Product <span className="font-medium">{product.name}</span>
												<span className="text-t3"> (new)</span>
											</div>
										);
									}
									return (
										<Accordion key={product.id} type="single" collapsible className="w-full">
											<AccordionItem value={product.id} className="border-b-0">
												<AccordionTrigger className="py-2 text-sm">
													Product {product.name} (new, {changeCount} detail{changeCount > 1 ? "s" : ""})
												</AccordionTrigger>
												<AccordionContent className="text-xs text-t3">
													<ul className="list-none space-y-1">
														{changes?.newItems.map((item) => (
															<li key={item.feature_id}>
																{item.feature_name}: none -{">"} {item.new_usage ?? "enabled"}
															</li>
														))}
														{changes?.priceChange && (
															<li>
																Price: none -{">"} ${changes.priceChange.new_price ?? 0}
															</li>
														)}
														{changes?.defaultChange && (
															<li>
																Auto-enable: off -{">"} on
															</li>
														)}
														{changes?.freeTrialChange && (
															<li>
																Free trial: none -{">"}{" "}
																{changes.freeTrialChange.new_trial
																	? `${changes.freeTrialChange.new_trial.length} ${changes.freeTrialChange.new_trial.duration}`
																	: "none"}
															</li>
														)}
													</ul>
												</AccordionContent>
											</AccordionItem>
										</Accordion>
									);
								})}
								{p?.updated?.map((product) => {
									const changes = product.changes;
									if (!changes) return null;
									const changeCount =
										changes.newItems.length +
										changes.removedItems.length +
										(changes.priceChange ? 1 : 0) +
										(changes.defaultChange ? 1 : 0) +
										(changes.freeTrialChange ? 1 : 0);
									if (changeCount === 0) return null;
									return (
										<Accordion key={product.id} type="single" collapsible className="w-full">
											<AccordionItem value={product.id} className="border-b-0">
												<AccordionTrigger className="py-2 text-sm">
													Product {product.name} ({changeCount} change{changeCount > 1 ? "s" : ""})
												</AccordionTrigger>
												<AccordionContent className="text-xs text-t3">
													<ul className="list-none space-y-1">
														{changes.newItems.map((item) => (
															<li key={item.feature_id}>
																{item.feature_name}: {item.old_usage ?? "none"} -{">"} {item.new_usage ?? "enabled"}
															</li>
														))}
														{changes.removedItems.map((item) => (
															<li key={item.feature_id}>
																{item.feature_name}: {item.old_usage ?? "enabled"} -{">"} none
															</li>
														))}
														{changes.priceChange && (
															<li>
																Price: ${changes.priceChange.old_price ?? 0} -{">"} ${changes.priceChange.new_price ?? 0}
															</li>
														)}
														{changes.defaultChange && (
															<li>
																Auto-enable: {changes.defaultChange.old_default ? "on" : "off"} -{">"}{" "}
																{changes.defaultChange.new_default ? "on" : "off"}
															</li>
														)}
														{changes.freeTrialChange && (
															<li>
																Free trial:{" "}
																{changes.freeTrialChange.old_trial
																	? `${changes.freeTrialChange.old_trial.length} ${changes.freeTrialChange.old_trial.duration}`
																	: "none"}{" "}
																-{">"}{" "}
																{changes.freeTrialChange.new_trial
																	? `${changes.freeTrialChange.new_trial.length} ${changes.freeTrialChange.new_trial.duration}`
																	: "none"}
															</li>
														)}
													</ul>
												</AccordionContent>
											</AccordionItem>
										</Accordion>
									);
								})}
								{hasChangesToSync && (
									<p>
										Type{" "}
										<code className="font-mono font-semibold">{confirmWord}</code>{" "}
										to continue.
									</p>
								)}
							</>
						)}
					</DialogDescription>
				</DialogHeader>

				{hasChangesToSync && (
					<Input
						value={confirmText}
						onChange={(e) => setConfirmText(e.target.value)}
						placeholder={confirmWord}
						className="w-full"
						disabled={!!preview?.defaultConflict}
					/>
				)}

				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => props.setOpen(false)}
						disabled={isLoading}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleSync}
						isLoading={isLoading}
						disabled={previewLoading || !hasChangesToSync || confirmText !== confirmWord || !!preview?.defaultConflict}
					>
						Sync to {targetEnvName}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
