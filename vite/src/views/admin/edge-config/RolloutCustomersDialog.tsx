import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@autumn/ui";
import { useForm } from "@tanstack/react-form";
import { CustomerSearchResults } from "./CustomerSearchResults";
import { OrgSearchResults } from "./OrgSearchResults";
import type { RolloutCustomerOption, RolloutOrg } from "./rolloutTypes";
import { SelectedCustomers } from "./SelectedCustomers";

type AddCustomersInput = { orgId: string; customerIds: string[] };

const toggleCustomer = ({
	selected,
	customer,
}: {
	selected: RolloutCustomerOption[];
	customer: RolloutCustomerOption;
}) =>
	selected.some(({ id }) => id === customer.id)
		? selected.filter(({ id }) => id !== customer.id)
		: [...selected, customer];

const addCustomersLabel = (count: number) => {
	if (count === 0) return "Add customers";
	if (count === 1) return "Add 1 customer";
	return `Add ${count} customers`;
};

const LABEL_CLASS = "text-xs font-medium text-muted-foreground";

const RolloutCustomersForm = ({
	onSubmit,
	onCancel,
	isSaving,
}: {
	onSubmit: (input: AddCustomersInput) => void;
	onCancel: () => void;
	isSaving: boolean;
}) => {
	const form = useForm({
		defaultValues: {
			orgSearch: "",
			org: null as RolloutOrg | null,
			customerSearch: "",
			customers: [] as RolloutCustomerOption[],
		},
		onSubmit: ({ value }) => {
			if (!value.org) return;
			onSubmit({
				orgId: value.org.id,
				customerIds: value.customers.map(({ id }) => id),
			});
		},
	});

	return (
		<form
			className="flex min-w-0 flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<form.Field name="orgSearch">
				{(field) => (
					<div className="flex flex-col gap-2">
						<label className={LABEL_CLASS} htmlFor="customer-org-search">
							Organization
						</label>
						<Input
							id="customer-org-search"
							placeholder="Search organizations"
							value={field.state.value}
							onChange={(event) => field.handleChange(event.target.value)}
							autoFocus
						/>
						<form.Field
							name="org"
							listeners={{
								onChange: () => form.setFieldValue("customers", []),
							}}
						>
							{(orgField) => (
								<OrgSearchResults
									search={field.state.value}
									selectedOrgId={orgField.state.value?.id ?? ""}
									onSelect={orgField.handleChange}
								/>
							)}
						</form.Field>
					</div>
				)}
			</form.Field>

			<form.Subscribe selector={(state) => state.values.org}>
				{(org) =>
					org && (
						<form.Field name="customerSearch">
							{(searchField) => (
								<div className="flex flex-col gap-2">
									<label className={LABEL_CLASS} htmlFor="customer-search">
										Customers
									</label>
									<Input
										id="customer-search"
										placeholder={`Search ${org.name || org.id}'s customers`}
										value={searchField.state.value}
										onChange={(event) =>
											searchField.handleChange(event.target.value)
										}
									/>
									<form.Field name="customers">
										{(customersField) => (
											<>
												<CustomerSearchResults
													orgId={org.id}
													search={searchField.state.value}
													selectedIds={customersField.state.value.map(
														({ id }) => id,
													)}
													onToggle={(customer) =>
														customersField.handleChange(
															toggleCustomer({
																selected: customersField.state.value,
																customer,
															}),
														)
													}
												/>
												<SelectedCustomers
													customers={customersField.state.value}
													onRemove={(customer) =>
														customersField.handleChange(
															toggleCustomer({
																selected: customersField.state.value,
																customer,
															}),
														)
													}
												/>
											</>
										)}
									</form.Field>
								</div>
							)}
						</form.Field>
					)
				}
			</form.Subscribe>

			<DialogFooter>
				<Button
					type="button"
					variant="secondary"
					onClick={onCancel}
					disabled={isSaving}
				>
					Cancel
				</Button>
				<form.Subscribe selector={(state) => state.values.customers.length}>
					{(customerCount) => (
						<Button
							type="submit"
							isLoading={isSaving}
							disabled={customerCount === 0}
						>
							{addCustomersLabel(customerCount)}
						</Button>
					)}
				</form.Subscribe>
			</DialogFooter>
		</form>
	);
};

/** Pick an org, then search its customers to put on the worker; the form resets by remounting on open. */
export const RolloutCustomersDialog = ({
	open,
	onOpenChange,
	onSubmit,
	isSaving,
	settleSeconds,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (input: AddCustomersInput) => void;
	isSaving: boolean;
	settleSeconds: number;
}) => (
	<Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
		<DialogContent className="max-h-[85vh] max-w-lg overflow-x-hidden overflow-y-auto">
			<DialogHeader>
				<DialogTitle>Add customers</DialogTitle>
				<DialogDescription>
					They go to the worker {settleSeconds}s after you add them, whatever
					their org's percent.
				</DialogDescription>
			</DialogHeader>
			{open && (
				<RolloutCustomersForm
					onSubmit={onSubmit}
					onCancel={() => onOpenChange(false)}
					isSaving={isSaving}
				/>
			)}
		</DialogContent>
	</Dialog>
);
