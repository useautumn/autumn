import type { Role } from "@autumn/shared";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./Select";

/**
 * Role display metadata.
 *
 * Descriptions enumerate every resource grant explicitly, derived from
 * `ROLE_SCOPES` in `shared/utils/scopeDefinitions.ts`. Keep these in sync
 * with that table — if a role's grants change there, update here.
 *
 * Convention:
 *   - Write access implies read (expanded at check time), so "Write" in
 *     the description subsumes Read.
 *   - Resources not listed in the description are NOT granted.
 */
const ROLE_META: Record<Role, { label: string; description: string }> = {
	owner: {
		label: "Owner",
		description:
			"Write on everything (organisation, customers, features, plans, rewards, balances, billing, API keys, platform) + read analytics. Can delete the org and manage ownership.",
	},
	admin: {
		label: "Admin",
		description:
			"Write on everything (organisation, customers, features, plans, rewards, balances, billing, API keys, platform) + read analytics. Cannot delete the org or transfer ownership.",
	},
	developer: {
		label: "Developer",
		description:
			"Write on customers, features, plans, rewards, balances, billing, API keys, and platform. Read organisation and analytics.",
	},
	sales: {
		label: "Sales",
		description:
			"Write on customers, billing, rewards, and balances. Read plans, features, and analytics. No access to organisation settings, API keys, or platform.",
	},
	member: {
		label: "Member",
		description:
			"Read-only on everything: organisation, customers, features, plans, rewards, balances, billing, analytics, API keys, platform. No write access.",
	},
};

const DEFAULT_ALLOWED: Role[] = ["admin", "developer", "sales", "member"];

export type RoleSelectProps = {
	value: Role;
	onChange: (role: Role) => void;
	/**
	 * Allowed role choices. Defaults to all roles EXCEPT owner (you can't
	 * invite someone as owner; ownership transfer is a separate flow).
	 * Pass the full list if you need owner included (e.g. when displaying
	 * an existing owner's current role — though the Select will be
	 * disabled in that case).
	 */
	allowed?: Role[];
	disabled?: boolean;
	/** Optional: disabled reason for tooltip display (use with ConditionalTooltip externally). */
	placeholder?: string;
	/** Optional: className passthrough for the SelectTrigger. */
	className?: string;
};

export function RoleSelect({
	value,
	onChange,
	allowed = DEFAULT_ALLOWED,
	disabled,
	placeholder,
	className,
}: RoleSelectProps) {
	// Radix `SelectValue` normally projects the selected item's children
	// into the trigger. Because each item renders `label + description`,
	// that would push the description into the cramped trigger area. We
	// override the projection by passing an explicit `children` prop to
	// `SelectValue`, showing only the label on the trigger while the
	// dropdown itself keeps the rich layout.
	const selectedLabel = ROLE_META[value]?.label ?? value;

	return (
		<Select
			value={value}
			onValueChange={(v) => onChange(v as Role)}
			disabled={disabled}
		>
			<SelectTrigger className={className}>
				<SelectValue placeholder={placeholder ?? "Select a role"}>
					{selectedLabel}
				</SelectValue>
			</SelectTrigger>
			{/*
			  `max-w-[340px]` constrains the dropdown so long descriptions
			  have an edge to wrap against. `whitespace-normal` + `break-words`
			  on the description overrides any inherited `whitespace-nowrap`
			  from the Radix select item styling.
			*/}
			<SelectContent className="max-w-[340px]">
				{allowed.map((role) => (
					<SelectItem
						key={role}
						value={role}
						textValue={ROLE_META[role].label}
						className="items-start"
					>
						<div className="flex flex-col items-start py-0.5 gap-0.5 w-full">
							<span className="text-sm font-medium">
								{ROLE_META[role].label}
							</span>
							<span className="text-xs text-muted-foreground whitespace-normal break-words leading-snug">
								{ROLE_META[role].description}
							</span>
						</div>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export type { Role };
// Export the metadata so callers can render role display names without
// instantiating a dropdown (e.g. for read-only member rows).
export { ROLE_META };
