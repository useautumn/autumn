import {
	Button,
	GroupedTabButton,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@autumn/ui";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
	formatCount,
	formatLimit,
	formatPolicyLabel,
	formatWindow,
} from "./formatRateLimit";
import { RateLimitOrgCombobox } from "./RateLimitOrgCombobox";
import type {
	RateLimitOrg,
	RateLimitPolicySummary,
	RateLimitScope,
} from "./rateLimitTypes";

export type RateLimitOverrideDraft = {
	org: RateLimitOrg | null;
	policy: RateLimitPolicySummary;
	scope: RateLimitScope;
};

const SCOPE_LABELS: Record<RateLimitScope, string> = {
	perCustomer: "Per customer",
	perOrg: "Per org",
};

const listScopes = ({ policy }: { policy: RateLimitPolicySummary }) =>
	(["perCustomer", "perOrg"] as const).filter((scope) => policy[scope]);

const findOverrideValue = ({ draft }: { draft: RateLimitOverrideDraft }) =>
	draft.policy.overrides.find(({ orgKey }) => orgKey === draft.org?.key)?.[
		draft.scope
	];

/** One number for one org on one layer; the window and over-limit behaviour stay as defined in code. */
export const RateLimitOverrideSheet = ({
	open,
	onOpenChange,
	initialDraft,
	policies,
	overrideOrgs,
	isSaving,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialDraft: RateLimitOverrideDraft;
	policies: RateLimitPolicySummary[];
	overrideOrgs: RateLimitOrg[];
	isSaving: boolean;
	onSave: (params: { draft: RateLimitOverrideDraft; value: number }) => void;
}) => {
	const [draft, setDraft] = useState(initialDraft);
	const [valueText, setValueText] = useState("");

	useEffect(() => {
		if (!open) return;
		setDraft(initialDraft);
		setValueText(String(findOverrideValue({ draft: initialDraft }) ?? ""));
	}, [open, initialDraft]);

	const layer = draft.policy[draft.scope];
	const value = Number.parseInt(valueText, 10);
	const isValid = draft.org !== null && Number.isInteger(value) && value >= 0;

	const selectPolicy = (policyId: string) => {
		const policy = policies.find(({ id }) => id === policyId);
		if (!policy) return;
		const scope = policy[draft.scope] ? draft.scope : listScopes({ policy })[0];
		setDraft({ ...draft, policy, scope });
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="!w-[28rem] !max-w-[28rem] sm:!w-[28rem] sm:!max-w-[28rem]"
			>
				<SheetHeader>
					<SheetTitle>Add override</SheetTitle>
					<SheetDescription>
						One number, one org. Window and behaviour stay.
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
					<div className="flex flex-col gap-1.5 text-sm">
						Org
						<RateLimitOrgCombobox
							value={draft.org}
							overrideOrgs={overrideOrgs}
							onChange={(org) => setDraft({ ...draft, org })}
							placeholder="Search orgs"
						/>
					</div>

					<div className="flex flex-col gap-1.5 text-sm">
						Limit
						<Select value={draft.policy.id} onValueChange={selectPolicy}>
							<SelectTrigger className="h-9 w-full">
								<SelectValue>
									{(policyId: string) => formatPolicyLabel(policyId)}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{policies.map((policy) => (
									<SelectItem key={policy.id} value={policy.id}>
										{formatPolicyLabel(policy.id)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-1.5 text-sm">
						Scope
						<GroupedTabButton
							value={draft.scope}
							onValueChange={(scope) =>
								setDraft({ ...draft, scope: scope as RateLimitScope })
							}
							options={listScopes({ policy: draft.policy }).map((scope) => ({
								value: scope,
								label: SCOPE_LABELS[scope],
							}))}
						/>
					</div>

					{layer && (
						<div className="flex flex-col gap-1.5 text-sm">
							<label htmlFor="rate-limit-override-value">Value</label>
							<div className="flex items-center gap-3">
								<div className="relative w-48">
									<Input
										id="rate-limit-override-value"
										type="number"
										min={0}
										value={valueText}
										onChange={(event) => setValueText(event.target.value)}
										className="pr-12 tabular-nums"
									/>
									<span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-tertiary-foreground">
										/ {formatWindow(layer.windowMs)}
									</span>
								</div>
								<span className="text-xs text-tertiary-foreground">
									default {formatLimit(layer)}
								</span>
							</div>
						</div>
					)}

					{layer && isValid && draft.org && (
						<p className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-tertiary-foreground">
							<span className="tabular-nums">{formatCount(layer.limit)}</span>
							<ArrowRightIcon className="size-3" />
							<span className="tabular-nums text-foreground">
								{formatLimit({ limit: value, windowMs: layer.windowMs })}
							</span>
							· {draft.org.name} · {formatPolicyLabel(draft.policy.id)} ·{" "}
							{SCOPE_LABELS[draft.scope].toLowerCase()}
						</p>
					)}
				</div>

				<div className="flex justify-end gap-2 border-t px-4 py-3">
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant="primary"
						isLoading={isSaving}
						disabled={!isValid}
						onClick={() => onSave({ draft, value })}
					>
						Save override
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
};
