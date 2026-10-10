import {
	Button,
	GroupedTabButton,
	Input,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { useEffect, useState } from "react";
import { formatEndpointLimit, formatWindow } from "./formatRateLimit";
import { RateLimitEndpointCombobox } from "./RateLimitEndpointCombobox";
import { RateLimitEndpointLabel } from "./RateLimitEndpointLabel";
import { RateLimitOrgCombobox } from "./RateLimitOrgCombobox";
import { TOUCH_TARGET, TOUCH_TARGET_INPUT } from "./rateLimitTableStyles";
import type {
	RateLimitEndpointOverride,
	RateLimitOrg,
	RateLimitOverrideLimits,
} from "./rateLimitTypes";

export type RateLimitEndpointDraft = {
	org: RateLimitOrg | null;
	endpoint: string | null;
};

const WINDOW_OPTIONS = [
	{ value: "1000", label: "per second" },
	{ value: "60000", label: "per minute" },
];
const DEFAULT_WINDOW_MS = 1000;

const findStoredOverride = ({
	orgs,
	draft,
}: {
	orgs: RateLimitOverrideLimits;
	draft: RateLimitEndpointDraft;
}) =>
	draft.org && draft.endpoint
		? orgs[draft.org.key]?.endpoints?.[draft.endpoint]
		: undefined;

/** One org, one endpoint, one cap counted on top of the endpoint's group limits. */
export const RateLimitEndpointOverrideSheet = ({
	open,
	onOpenChange,
	initialDraft,
	orgs,
	endpoints,
	overrideOrgs,
	isSaving,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialDraft: RateLimitEndpointDraft;
	orgs: RateLimitOverrideLimits;
	endpoints: string[];
	overrideOrgs: RateLimitOrg[];
	isSaving: boolean;
	onSave: (params: {
		org: RateLimitOrg;
		endpoint: string;
		override: RateLimitEndpointOverride;
	}) => void;
}) => {
	const [draft, setDraft] = useState(initialDraft);
	const [valueText, setValueText] = useState("");
	const [windowMs, setWindowMs] = useState(DEFAULT_WINDOW_MS);

	// The form always shows what is stored for the selected org and endpoint.
	const selectDraft = (next: RateLimitEndpointDraft) => {
		const stored = findStoredOverride({ orgs, draft: next });
		setDraft(next);
		setValueText(String(stored?.limit ?? ""));
		if (stored) setWindowMs(stored.windowMs);
	};

	useEffect(() => {
		if (!open) return;
		const stored = findStoredOverride({ orgs, draft: initialDraft });
		setDraft(initialDraft);
		setValueText(String(stored?.limit ?? ""));
		setWindowMs(stored?.windowMs ?? DEFAULT_WINDOW_MS);
	}, [open, initialDraft]);

	const isEditing = findStoredOverride({ orgs, draft }) !== undefined;
	const limit = Number.parseInt(valueText, 10);
	const isValid = Number.isInteger(limit) && limit >= 0;
	const { org, endpoint } = draft;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="md:!w-[28rem] md:!max-w-[28rem]">
				<SheetHeader>
					<SheetTitle>
						{isEditing ? "Edit endpoint override" : "Add endpoint override"}
					</SheetTitle>
					<SheetDescription>
						Caps one endpoint for one org, on top of its group limits. 0 blocks
						it.
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
					<div className="flex flex-col gap-1.5 text-sm">
						Org
						<RateLimitOrgCombobox
							value={org}
							overrideOrgs={overrideOrgs}
							onChange={(next) => selectDraft({ ...draft, org: next })}
							placeholder="Search orgs"
							triggerClassName="h-11 md:h-auto"
						/>
					</div>

					<div className="flex flex-col gap-1.5 text-sm">
						Endpoint
						<RateLimitEndpointCombobox
							value={endpoint}
							endpoints={endpoints}
							onChange={(next) => selectDraft({ ...draft, endpoint: next })}
							triggerClassName="h-11 md:h-auto"
						/>
					</div>

					<div className="flex flex-col gap-1.5 text-sm">
						<label htmlFor="rate-limit-endpoint-limit">Limit</label>
						<div className="flex flex-wrap items-center gap-3">
							<div className="relative flex-1 md:w-40 md:flex-none">
								<Input
									id="rate-limit-endpoint-limit"
									type="number"
									inputMode="numeric"
									min={0}
									value={valueText}
									onChange={(event) => setValueText(event.target.value)}
									className={cn("pr-12 tabular-nums", TOUCH_TARGET_INPUT)}
								/>
								<span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-tertiary-foreground">
									/ {formatWindow(windowMs)}
								</span>
							</div>
							<GroupedTabButton
								value={String(windowMs)}
								onValueChange={(next) => setWindowMs(Number(next))}
								options={WINDOW_OPTIONS}
								buttonClassName={TOUCH_TARGET}
							/>
						</div>
					</div>

					{org && endpoint && isValid && (
						<div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-tertiary-foreground">
							<RateLimitEndpointLabel endpoint={endpoint} />
							<span>
								{org.name} ·{" "}
								<span className="tabular-nums text-foreground">
									{formatEndpointLimit({ limit, windowMs })}
								</span>
								{limit > 0 && " per org, on top of its group limits"}
							</span>
						</div>
					)}
				</div>

				<div className="flex justify-end gap-2 border-t px-4 py-3">
					<Button
						variant="secondary"
						className={cn("flex-1 md:flex-none", TOUCH_TARGET_INPUT)}
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						className={cn("flex-1 md:flex-none", TOUCH_TARGET_INPUT)}
						isLoading={isSaving}
						disabled={!org || !endpoint || !isValid}
						onClick={() =>
							org &&
							endpoint &&
							onSave({ org, endpoint, override: { limit, windowMs } })
						}
					>
						Save override
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
};
