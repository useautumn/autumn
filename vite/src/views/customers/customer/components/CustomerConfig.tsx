import type { CreateCustomer } from "@autumn/shared";
import { useRef } from "react";
import { FormLabel as FieldLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";

export const CustomerConfig = ({
	customer,
	setCustomer,
	isUpdate = false,
}: {
	customer: CreateCustomer;
	setCustomer: (customer: CreateCustomer) => void;
	isUpdate?: boolean;
}) => {
	// Keep original ref of customer id
	const originalId = useRef(customer.id);
	return (
		<div className="flex flex-col gap-4 w-full">
			<div className="flex gap-2 w-full">
				<div className="w-full">
					<FieldLabel>Name</FieldLabel>
					<Input
						value={customer.name || ""}
						onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
					/>
				</div>
				<div className="w-full">
					<FieldLabel>ID</FieldLabel>
					<Input
						value={customer.id || ""}
						onChange={(e) => setCustomer({ ...customer, id: e.target.value })}
						disabled={originalId.current !== null && isUpdate}
					/>
				</div>
			</div>
			<div>
				<FieldLabel>Email</FieldLabel>
				<Input
					value={customer.email || ""}
					onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
				/>
			</div>
			<div>
				<FieldLabel>Fingerprint</FieldLabel>
				<Input
					value={customer.fingerprint || ""}
					onChange={(e) =>
						setCustomer({ ...customer, fingerprint: e.target.value })
					}
				/>
			</div>
		</div>
	);
};
