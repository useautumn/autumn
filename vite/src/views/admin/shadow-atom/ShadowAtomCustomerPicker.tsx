import { Input } from "@autumn/ui";
import { useState } from "react";
import { CustomerSearchResults } from "../edge-config/CustomerSearchResults";
import type { RolloutCustomerOption } from "../edge-config/rolloutTypes";
import { ShadowAtomPicked } from "./ShadowAtomPicked";

/** Search the picked org's customers by name or email and pick one; its id is what gets stored. */
export const ShadowAtomCustomerPicker = ({
	orgId,
	value,
	onChange,
}: {
	orgId: string | null;
	value: RolloutCustomerOption | null;
	onChange: (customer: RolloutCustomerOption | null) => void;
}) => {
	const [search, setSearch] = useState("");

	if (value)
		return (
			<ShadowAtomPicked
				title={value.name ?? value.id}
				subtitle={value.email ?? value.id}
				clearLabel="Pick another customer"
				onClear={() => onChange(null)}
			/>
		);

	return (
		<div className="flex w-64 flex-col gap-1">
			<Input
				value={search}
				onChange={(event) => setSearch(event.target.value)}
				placeholder={
					orgId ? "Search customers by name or email" : "Pick an org first"
				}
				aria-label="Search customers"
				disabled={!orgId}
				className="h-8 text-xs"
			/>
			{orgId && search.trim() && (
				<CustomerSearchResults
					orgId={orgId}
					search={search}
					selectedIds={[]}
					onToggle={(customer) => {
						onChange(customer);
						setSearch("");
					}}
				/>
			)}
		</div>
	);
};
