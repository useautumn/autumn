import type { GetCatalogResponse } from "@autumn/shared";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Skeleton,
	Switch,
} from "@autumn/ui";
import {
	CopyIcon,
	LockSimpleIcon,
	ShieldCheckIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { useCatalogExportQuery } from "../hooks/useCatalogExportQuery";
import type { CatalogExportSections } from "../types/catalogExportSections";
import { catalogToUpdateParams } from "../utils/catalogToUpdateParams";
import { CatalogJsonEditor } from "./CatalogJsonEditor";
import { CatalogOrgRow } from "./CatalogOrgRow";

const DEFAULT_SECTIONS: CatalogExportSections = {
	features: true,
	plans: true,
	rewards: false,
};

const plural = (count: number, singular: string) =>
	`${count} ${singular}${count === 1 ? "" : "s"}`;

const sectionCounts = (catalog: GetCatalogResponse | undefined) => {
	if (!catalog) return { features: "", plans: "", rewards: "" };
	const planIds = new Set(catalog.plans.map((plan) => plan.id));
	const variants = catalog.plans.reduce(
		(sum, plan) => sum + (plan.variants?.length ?? 0),
		0,
	);
	return {
		features: plural(catalog.features.length, "feature"),
		plans: `${plural(planIds.size, "plan")} · ${plural(variants, "variant")}`,
		rewards: `${plural(catalog.rewards.length, "reward")} · ${plural(catalog.referral_programs.length, "program")}`,
	};
};

function SectionToggle({
	title,
	description,
	count,
	checked,
	onCheckedChange,
}: {
	title: string;
	description?: string;
	count: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-center gap-3 px-3 py-2.5">
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="text-foreground text-sm">{title}</span>
				{description && (
					<span className="text-tertiary-foreground text-xs">
						{description}
					</span>
				)}
			</div>
			<span className="text-tertiary-foreground text-xs">{count}</span>
			<Switch
				aria-label={title}
				checked={checked}
				onCheckedChange={onCheckedChange}
			/>
		</div>
	);
}

export function ExportCatalogDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const env = useEnv();
	const { org } = useOrg();
	const [sections, setSections] = useState(DEFAULT_SECTIONS);

	const {
		data: catalog,
		error,
		isLoading,
	} = useCatalogExportQuery({ enabled: open });

	const json = useMemo(
		() =>
			catalog
				? JSON.stringify(catalogToUpdateParams({ catalog, sections }), null, 2)
				: "",
		[catalog, sections],
	);
	const counts = sectionCounts(catalog);
	const lineCount = json ? json.split("\n").length : 0;

	const copyJson = async () => {
		await navigator.clipboard.writeText(json);
		toast.success("Catalog JSON copied");
	};

	const setSection = (key: keyof CatalogExportSections) => (checked: boolean) =>
		setSections((current) => ({ ...current, [key]: checked }));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-[768px] flex-col">
				<DialogHeader>
					<DialogTitle>Export catalog</DialogTitle>
					<DialogDescription>
						Paste this into Import catalog on a local or staging dashboard.
					</DialogDescription>
				</DialogHeader>

				<CatalogOrgRow
					label="Source"
					orgName={org?.name ?? ""}
					detail={org?.slug ?? ""}
					env={env}
				/>

				<div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
					<SectionToggle
						title="Features"
						count={counts.features}
						checked={sections.features}
						onCheckedChange={setSection("features")}
					/>
					<SectionToggle
						title="Plans"
						description="Includes variants and licenses"
						count={counts.plans}
						checked={sections.plans}
						onCheckedChange={setSection("plans")}
					/>
					<SectionToggle
						title="Rewards & referral programs"
						description="Off by default"
						count={counts.rewards}
						checked={sections.rewards}
						onCheckedChange={setSection("rewards")}
					/>
				</div>

				{isLoading ? (
					<Skeleton className="h-[344px] w-full rounded-lg" />
				) : error ? (
					<p role="alert" className="text-destructive text-xs">
						{getBackendErr(error, "Failed to load the catalog")}
					</p>
				) : (
					<CatalogJsonEditor
						value={json}
						readOnly
						height="344px"
						badge={
							<span className="flex items-center gap-1 rounded border border-border bg-background/80 px-1.5 py-0.5 text-tertiary-foreground text-xs">
								<LockSimpleIcon size={11} />
								Read-only · {lineCount} lines
							</span>
						}
					/>
				)}

				<div className="flex items-center gap-2 pt-1">
					<span className="flex flex-1 items-center gap-1.5 text-tertiary-foreground text-xs">
						<ShieldCheckIcon size={13} />
						Stripe ids and internal ids are stripped.
					</span>
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Close
					</Button>
					<Button variant="primary" disabled={!json} onClick={copyJson}>
						<CopyIcon size={14} />
						Copy JSON
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
