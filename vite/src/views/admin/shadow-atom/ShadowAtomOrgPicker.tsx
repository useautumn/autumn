import { Input } from "@autumn/ui";
import { useState } from "react";
import { OrgSearchResults } from "../edge-config/OrgSearchResults";
import type { RolloutOrg } from "../edge-config/rolloutTypes";
import { ShadowAtomPicked } from "./ShadowAtomPicked";

/** Search orgs by name or slug (the admin org search) and pick one; its id is what gets stored. */
export const ShadowAtomOrgPicker = ({
	value,
	onChange,
	disabled = false,
}: {
	value: RolloutOrg | null;
	onChange: (org: RolloutOrg | null) => void;
	disabled?: boolean;
}) => {
	const [search, setSearch] = useState("");

	if (value)
		return (
			<ShadowAtomPicked
				title={value.name || value.id}
				subtitle={value.slug || value.id}
				clearLabel="Pick another org"
				onClear={() => onChange(null)}
			/>
		);

	return (
		<div className="flex w-64 flex-col gap-1">
			<Input
				value={search}
				onChange={(event) => setSearch(event.target.value)}
				placeholder="Search orgs by name or slug"
				aria-label="Search orgs"
				disabled={disabled}
				className="h-8 text-xs"
			/>
			{search.trim() && (
				<OrgSearchResults
					search={search}
					selectedOrgId=""
					onSelect={(org) => {
						onChange(org);
						setSearch("");
					}}
				/>
			)}
		</div>
	);
};
