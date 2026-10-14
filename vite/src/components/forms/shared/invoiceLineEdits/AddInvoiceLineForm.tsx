import type { AddLine } from "@autumn/shared";
import { Button, IconButton, Input } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";

export function AddInvoiceLineForm({
	onAdd,
}: {
	onAdd: (line: AddLine) => void;
}) {
	const [open, setOpen] = useState(false);
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");

	const parsedAmount = Number(amount);
	const isValid =
		amount.trim() !== "" &&
		Number.isFinite(parsedAmount) &&
		description.trim() !== "";

	const close = () => {
		setOpen(false);
		setAmount("");
		setDescription("");
	};

	const submit = () => {
		if (!isValid) return;
		onAdd({ amount: parsedAmount, description: description.trim() });
		close();
	};

	if (!open) {
		return (
			<div>
				<IconButton
					className="text-tertiary-foreground"
					icon={<PlusIcon size={12} />}
					onClick={() => setOpen(true)}
					size="sm"
					variant="muted"
				>
					Add line
				</IconButton>
			</div>
		);
	}

	return (
		<form
			className="flex items-center gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<Input
				autoFocus
				aria-label="Line description"
				className="h-7 min-w-0 flex-1 text-sm"
				onChange={(event) => setDescription(event.target.value)}
				placeholder="Description"
				value={description}
			/>
			<Input
				aria-label="Line amount"
				className="h-7 w-24 text-sm"
				inputMode="decimal"
				onChange={(event) => setAmount(event.target.value)}
				placeholder="Amount"
				step="any"
				type="number"
				value={amount}
			/>
			<Button disabled={!isValid} size="sm" type="submit" variant="secondary">
				Add
			</Button>
			<Button onClick={close} size="sm" type="button" variant="muted">
				Cancel
			</Button>
		</form>
	);
}
