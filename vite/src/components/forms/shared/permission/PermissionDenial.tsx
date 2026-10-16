import { Alert, AlertDescription, AlertTitle } from "@autumn/ui";
import { ProhibitIcon } from "@phosphor-icons/react";
import { usePermissionDenial } from "./PermissionDenialContext";
import {
	formatAskRoles,
	formatDecidedBy,
	formatViolation,
	type PermissionSection,
	violationsInSection,
} from "./permissionDenialUtils";

/** A section's violations under its fields; `summary` adds the rule, its note and who can approve. */
export function PermissionDenial({ section }: { section: PermissionSection }) {
	const resolved = usePermissionDenial();
	if (!resolved) return null;

	const { denial } = resolved;
	const violations = violationsInSection({ denial, section }).map(
		(violation) => (
			<p
				key={violation.field}
				className="flex items-center gap-1.5 text-xs text-destructive dark:text-red-400"
			>
				<ProhibitIcon className="size-3.5 shrink-0" />
				{formatViolation({ violation })}
			</p>
		),
	);

	if (section !== "summary") {
		if (violations.length === 0) return null;
		return <div className="flex flex-col gap-1 px-4 pt-2">{violations}</div>;
	}

	return (
		<Alert variant="destructive">
			<ProhibitIcon />
			<AlertTitle>{denial.decided_by.rule_name}</AlertTitle>
			<AlertDescription className="flex flex-col gap-1 [&_p:not(:last-child)]:mb-0">
				{violations}
				<p>{denial.message}</p>
				<p className="text-xs text-tertiary-foreground">
					{formatDecidedBy({ denial })}. {formatAskRoles({ denial })}.
				</p>
			</AlertDescription>
		</Alert>
	);
}
