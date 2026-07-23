import { SearchableSelect } from "@autumn/ui";
import { useState } from "react";

type Plan = { id: string; name: string; archived?: boolean };

const plans: Plan[] = [
	{ id: "free", name: "Free" },
	{ id: "starter", name: "Starter — $19/mo" },
	{ id: "pro", name: "Pro — $49/mo" },
	{ id: "enterprise", name: "Enterprise — custom" },
	{ id: "legacy_growth", name: "Growth (legacy)", archived: true },
];

const features = [
	{ id: "api_credits", name: "API Credits" },
	{ id: "seats", name: "Seats" },
	{ id: "storage_gb", name: "Storage (GB)" },
];

export const Default = () => {
	const [value, setValue] = useState<string | null>("pro");
	return (
		<SearchableSelect
			value={value}
			onValueChange={setValue}
			options={plans}
			getOptionValue={(plan) => plan.id}
			getOptionLabel={(plan) => plan.name}
			placeholder="Select a plan"
			triggerClassName="p-2 h-input"
		/>
	);
};

export const Placeholder = () => {
	const [value, setValue] = useState<string | null>(null);
	return (
		<SearchableSelect
			value={value}
			onValueChange={setValue}
			options={features}
			getOptionValue={(feature) => feature.id}
			getOptionLabel={(feature) => feature.name}
			placeholder="Select a feature"
			triggerClassName="p-2 h-input"
		/>
	);
};

export const Searchable = () => {
	const [value, setValue] = useState<string | null>("starter");
	return (
		<SearchableSelect
			value={value}
			onValueChange={setValue}
			options={plans}
			getOptionValue={(plan) => plan.id}
			getOptionLabel={(plan) => plan.name}
			getOptionDisabled={(plan) => plan.archived === true}
			searchable
			searchPlaceholder="Search plans..."
			emptyText="No plans found"
			placeholder="Select a plan"
			triggerClassName="p-2 h-input"
		/>
	);
};

export const Disabled = () => {
	const [value, setValue] = useState<string | null>("enterprise");
	return (
		<SearchableSelect
			value={value}
			onValueChange={setValue}
			options={plans}
			getOptionValue={(plan) => plan.id}
			getOptionLabel={(plan) => plan.name}
			disabled
			triggerClassName="p-2 h-input"
		/>
	);
};
