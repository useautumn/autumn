import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useAxiosInstance } from "@/services/useAxiosInstance";

type OrgSearchResult = {
	id: string;
	name: string;
	slug: string;
	createdAt: string;
};

type OrgSearchResponse = {
	rows: OrgSearchResult[];
	hasNextPage: boolean;
};

export const RolloutOrgDialog = ({
	open,
	onOpenChange,
	rolloutId,
	onSubmit,
	isSaving,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	rolloutId?: string;
	onSubmit: ({
		rolloutId,
		orgId,
		percent,
	}: {
		rolloutId: string;
		orgId: string;
		percent: number;
	}) => void;
	isSaving: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const [search, setSearch] = useState("");
	const [selectedOrgId, setSelectedOrgId] = useState<string>("");
	const [percentInput, setPercentInput] = useState("0");
	const debouncedSearch = useDebounce({
		value: search.trim(),
		delayMs: 250,
	});

	useEffect(() => {
		if (open) return;
		setSearch("");
		setSelectedOrgId("");
		setPercentInput("0");
	}, [open]);

	const { data, isLoading } = useQuery<OrgSearchResponse>({
		queryKey: ["admin-rollout-org-search", debouncedSearch],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (debouncedSearch) {
				params.append("search", debouncedSearch);
			}

			const { data } = await axiosInstance.get(
				`/admin/orgs${params.toString() ? `?${params.toString()}` : ""}`,
			);
			return data;
		},
		enabled: open && debouncedSearch.length > 0,
	});

	const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
	const selectedOrg = rows.find((row) => row.id === selectedOrgId);
	const percent = Number(percentInput);
	const isPercentValid =
		!Number.isNaN(percent) && percent >= 0 && percent <= 100;

	const handleSubmit = () => {
		if (!rolloutId || !selectedOrgId || !isPercentValid) return;
		onSubmit({
			rolloutId,
			orgId: selectedOrgId,
			percent,
		});
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Add Org Override</DialogTitle>
					<DialogDescription>
						Search for an organization and set the rollout percentage override.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<label
							className="text-xs font-medium text-muted-foreground"
							htmlFor="org-search"
						>
							Organization
						</label>
						<Input
							id="org-search"
							placeholder="Search organizations by name, id, or slug"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
						<div className="min-h-48 rounded-lg border bg-background">
							{debouncedSearch.length === 0 ? (
								<div className="flex h-48 items-center justify-center px-4 text-center text-sm text-tertiary-foreground">
									Start typing to search organizations.
								</div>
							) : isLoading ? (
								<div className="flex h-48 items-center justify-center px-4 text-sm text-tertiary-foreground">
									Searching organizations...
								</div>
							) : rows.length === 0 ? (
								<div className="flex h-48 items-center justify-center px-4 text-sm text-tertiary-foreground">
									No organizations found.
								</div>
							) : (
								<div className="max-h-48 overflow-y-auto p-2">
									{rows.map((org) => {
										const isSelected = selectedOrgId === org.id;

										return (
											<button
												type="button"
												key={org.id}
												onClick={() => setSelectedOrgId(org.id)}
												className={`flex w-full flex-col rounded-md border px-3 py-2 text-left transition-colors ${
													isSelected
														? "border-primary bg-primary/5"
														: "border-transparent hover:border-border hover:bg-muted/40"
												}`}
											>
												<span className="text-sm font-medium text-foreground">
													{org.name || org.id}
												</span>
												<span className="font-mono text-[11px] text-tertiary-foreground">
													{org.id}
												</span>
												{org.slug && (
													<span className="text-[11px] text-tertiary-foreground">
														{org.slug}
													</span>
												)}
											</button>
										);
									})}
								</div>
							)}
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<label
							className="text-xs font-medium text-muted-foreground"
							htmlFor="org-percent"
						>
							Percent
						</label>
						<Input
							id="org-percent"
							type="number"
							min={0}
							max={100}
							value={percentInput}
							onChange={(event) => setPercentInput(event.target.value)}
						/>
						{selectedOrg && (
							<p className="text-[11px] text-tertiary-foreground">
								Override will apply to{" "}
								<span className="font-mono">{selectedOrg.id}</span>.
							</p>
						)}
						{percentInput.length > 0 && !isPercentValid && (
							<p className="text-[11px] text-red-600">
								Enter a percentage between 0 and 100.
							</p>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => onOpenChange(false)}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!rolloutId || !selectedOrgId || !isPercentValid}
						isLoading={isSaving}
					>
						Save Override
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
