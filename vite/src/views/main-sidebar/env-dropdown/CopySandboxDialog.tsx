import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useSandboxCatalogQuery } from "@/hooks/queries/useSandboxCatalogQuery";
import {
	type SandboxSummary,
	useCopySandbox,
} from "@/hooks/queries/useSandboxesQuery";
import { getBackendErr } from "@/utils/genUtils";
import { CopySandboxChecklist } from "./CopySandboxChecklist";

export const CopySandboxDialog = ({
	target,
	sandboxes,
	open,
	setOpen,
}: {
	target: SandboxSummary;
	sandboxes: SandboxSummary[];
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const copySandbox = useCopySandbox();
	const [sourceId, setSourceId] = useState("");
	// Track de-selections (default = everything checked) so a freshly loaded
	// catalog needs no effect to initialise.
	const [deselected, setDeselected] = useState<{
		products: Set<string>;
		features: Set<string>;
	}>({ products: new Set(), features: new Set() });

	const sources = sandboxes.filter((s) => s.id !== target.id);
	const { products, features, isLoading } = useSandboxCatalogQuery(
		sourceId || null,
	);

	const selectSource = (id: string) => {
		setSourceId(id);
		setDeselected({ products: new Set(), features: new Set() });
	};

	const toggle = (kind: "products" | "features", id: string) => {
		setDeselected((prev) => {
			const next = new Set(prev[kind]);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return { ...prev, [kind]: next };
		});
	};

	const checkedProducts = products.filter(
		(p) => !deselected.products.has(p.id),
	);
	const checkedProductIds = checkedProducts.map((p) => p.id);
	const forcedBy = new Map<string, string[]>();
	for (const p of checkedProducts) {
		for (const fid of p.featureIds) {
			const names = forcedBy.get(fid) ?? [];
			if (!names.includes(p.name)) {
				names.push(p.name);
			}
			forcedBy.set(fid, names);
		}
	}
	const checkedFeatureIds = features
		.filter((f) => forcedBy.has(f.id) || !deselected.features.has(f.id))
		.map((f) => f.id);
	const nothingSelected =
		checkedProductIds.length === 0 && checkedFeatureIds.length === 0;

	const handleCopy = async () => {
		if (!sourceId || nothingSelected) {
			return;
		}

		try {
			await copySandbox.mutateAsync({
				fromSandboxId: sourceId,
				toSandboxId: target.id,
				productIds: checkedProductIds,
				featureIds: checkedFeatureIds,
			});
			toast.success(`Imported plans & features into ${target.name}`);
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to import"));
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="bg-card">
				<DialogHeader>
					<DialogTitle>Import into {target.name}</DialogTitle>
					<DialogDescription>
						Import plans and features from another sandbox into{" "}
						<span className="font-bold">{target.name}</span>. Existing items
						with a matching ID are overwritten; features used by a selected plan
						are always included.
					</DialogDescription>
				</DialogHeader>

				<Select
					value={sourceId}
					onValueChange={selectSource}
					items={Object.fromEntries(sources.map((s) => [s.id, s.name]))}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Select a source sandbox" />
					</SelectTrigger>
					<SelectContent>
						{sources.map((s) => (
							<SelectItem key={s.id} value={s.id}>
								{s.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{sourceId && (
					<div className="flex max-h-72 flex-col gap-4 overflow-y-auto">
						<CopySandboxChecklist
							isLoading={isLoading}
							items={products}
							kind="plan"
							onToggle={(id) => toggle("products", id)}
							title="Plans"
							deselected={deselected.products}
						/>
						<CopySandboxChecklist
							isLoading={isLoading}
							items={features}
							kind="feature"
							onToggle={(id) => toggle("features", id)}
							title="Features"
							deselected={deselected.features}
							forcedBy={forcedBy}
						/>
					</div>
				)}

				<DialogFooter>
					<Button onClick={() => setOpen(false)} variant="secondary">
						Cancel
					</Button>
					<Button
						disabled={!sourceId || nothingSelected}
						isLoading={copySandbox.isPending}
						onClick={handleCopy}
					>
						Import
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
