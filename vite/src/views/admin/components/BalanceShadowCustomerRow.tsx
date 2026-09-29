import {
	Button,
	Input,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { Trash2 } from "lucide-react";
import { useId } from "react";
import type { BalanceShadowCustomerRow as CustomerRow } from "./balanceShadowConfig";

const identityFields = [
	{ name: "orgId", label: "Organization ID" },
	{ name: "customerId", label: "External customer ID" },
	{ name: "featureId", label: "Feature ID" },
] as const;

const environments = [
	{ label: "Sandbox", value: "sandbox" },
	{ label: "Live", value: "live" },
];

export function BalanceShadowCustomerRow({
	customer,
	index,
	onChange,
	onRemove,
}: {
	customer: CustomerRow;
	index: number;
	onChange: (customer: CustomerRow) => void;
	onRemove: () => void;
}) {
	const id = useId();
	return (
		<fieldset className="grid min-w-0 gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
			<legend className="px-1 text-xs text-tertiary-foreground">
				Entry {index + 1}
			</legend>
			{identityFields.map(({ name, label }) => (
				<div key={name} className="flex min-w-0 flex-col gap-1.5">
					<label className="text-sm font-medium" htmlFor={`${id}-${name}`}>
						{label}
					</label>
					<Input
						id={`${id}-${name}`}
						value={customer[name]}
						maxLength={200}
						autoComplete="off"
						onChange={(event) =>
							onChange({ ...customer, [name]: event.target.value })
						}
					/>
				</div>
			))}
			<div className="flex min-w-0 flex-col gap-1.5">
				<label className="text-sm font-medium" htmlFor={`${id}-env`}>
					Environment
				</label>
				<Select
					value={customer.env}
					items={environments}
					onValueChange={(value) => {
						if (value === "live" || value === "sandbox")
							onChange({ ...customer, env: value });
					}}
				>
					<SelectTrigger id={`${id}-env`}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{environments.map((environment) => (
								<SelectItem key={environment.value} value={environment.value}>
									{environment.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
			<Button
				type="button"
				variant="secondary"
				size="sm"
				onClick={onRemove}
				aria-label={`Remove entry ${index + 1}`}
			>
				<Trash2 aria-hidden="true" /> Remove
			</Button>
		</fieldset>
	);
}
