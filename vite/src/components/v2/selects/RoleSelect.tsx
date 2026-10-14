import type { Role } from "@autumn/shared";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";

const ROLE_META: Record<Role, { label: string; description: string }> = {
	owner: {
		label: "Owner",
		description:
			"Write on everything (organisation, customers, features, plans, rewards, balances, billing, migrations, API keys, platform) + read analytics. Can delete the org and manage ownership.",
	},
	admin: {
		label: "Admin",
		description:
			"Write on everything (organisation, customers, features, plans, rewards, balances, billing, migrations, API keys, platform) + read analytics. Cannot delete the org or transfer ownership.",
	},
	developer: {
		label: "Developer",
		description:
			"Write on customers, features, plans, rewards, balances, billing, migrations, API keys, and platform. Read organisation and analytics.",
	},
	sales: {
		label: "Sales",
		description:
			"Write on customers, billing, rewards, and balances. Read plans, features, and analytics. No access to organisation settings, API keys, or platform.",
	},
	member: {
		label: "Member",
		description:
			"Read-only on organisation, customers, features, plans, rewards, balances, billing, analytics, API keys, and platform. No migrations access.",
	},
};

const DEFAULT_ALLOWED: Role[] = ["admin", "developer", "sales", "member"];

export type RoleSelectProps = {
	value: Role;
	onChange: (role: Role) => void;
	allowed?: Role[];
	disabled?: boolean;
	placeholder?: string;
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
			<SelectContent className="max-w-[340px]">
				{allowed.map((role) => (
					<SelectItem key={role} value={role} className="items-start py-1.5">
						<div className="flex w-full flex-col items-start gap-0.5">
							<span className="text-sm font-medium text-foreground">
								{ROLE_META[role].label}
							</span>
							<span className="text-xs leading-4 text-tertiary-foreground whitespace-normal break-words">
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
export { ROLE_META };
