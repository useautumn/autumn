import { useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/v2/dialogs/Dialog";
import { FormLabel as FieldLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";

export function CustomerListCreateButton() {
	const navigate = useNavigate();
	const axiosInstance = useAxiosInstance();
	const [open, setOpen] = useState(false);
	const [fields, setFields] = useState<{ [key: string]: string }>({
		name: "",
		id: "",
		email: "",
		fingerprint: "",
	});

	const [isLoading, setIsLoading] = useState(false);

	const nameInputRef = useRef<HTMLInputElement>(null);

	const handleCreate = async () => {
		setIsLoading(true);

		try {
			const { data } = await CusService.createCustomer(axiosInstance, {
				...fields,
				id: fields.id ? fields.id : null,
				name: fields.name || null,
				email: fields.email ? fields.email.trim() : null,
				fingerprint: fields.fingerprint ? fields.fingerprint : undefined,
			});

			const customer = data.customer || data;
			if (customer) {
				navigateTo(
					`/customers/${
						customer.id || customer.autumn_id || customer.internal_id
					}`,
					navigate,
				);
			}
			toast.success("Customer created successfully");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create customer"));
		}
		setIsLoading(false);
	};

	useHotkeys(
		"n",
		(event) => {
			event.preventDefault();
			setOpen(true);
			// Focus name input after dialog open (after next tick)
			setTimeout(() => {
				nameInputRef.current?.focus();
			}, 0);
		},
		{ enableOnFormTags: false },
	);

	useHotkeys(
		"meta+enter",
		(event) => {
			event.preventDefault();
			handleCreate();
		},
		{ enableOnFormTags: true },
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(val) => {
				setOpen(val);
				if (val) {
					// Focus name input when dialog is opened with the button as well
					setTimeout(() => {
						nameInputRef.current?.focus();
					}, 0);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button
					variant="primary"
					size="default"
					className="gap-1.5 font-medium"
				>
					New Customer
				</Button>
			</DialogTrigger>
			<DialogContent className="w-[400px] bg-card">
				<DialogHeader>
					<DialogTitle>Create Customer</DialogTitle>
				</DialogHeader>
				<div className="flex gap-2">
					<div className="flex-1">
						<FieldLabel>Name</FieldLabel>
						<Input
							ref={nameInputRef}
							value={fields.name}
							onChange={(e) => setFields({ ...fields, name: e.target.value })}
						/>
					</div>
					<div className="flex-1">
						<FieldLabel>ID</FieldLabel>
						<Input
							value={fields.id}
							onChange={(e) => setFields({ ...fields, id: e.target.value })}
						/>
					</div>
				</div>
				<div>
					<FieldLabel>Email</FieldLabel>
					<Input
						value={fields.email}
						placeholder="optional"
						onChange={(e) => setFields({ ...fields, email: e.target.value })}
					/>
				</div>
				<DialogFooter>
					<Button
						onClick={handleCreate}
						isLoading={isLoading}
						variant="primary"
						disabled={!fields.id.trim() && !fields.email.trim()}
					>
						Create
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
