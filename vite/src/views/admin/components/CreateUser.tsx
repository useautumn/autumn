import { useState } from "react";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { authClient } from "@/lib/auth-client";
import { getBackendErr } from "@/utils/genUtils";
import { toast } from "sonner";

export const CreateUser = () => {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		password: "",
	});

	const handleSubmit = async () => {
		// TODO: Implement user creation logic
		try {
			setLoading(true);
			const { data, error } = await authClient.admin.createUser({
				name: formData.name,
				email: formData.email,
				password: formData.password,
			});
			if (error) {
				toast.error(getBackendErr(error, "Failed to create user"));
			} else {
				toast.success("User created successfully");
				setOpen(false);
			}
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create user"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{/* <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Create User
        </Button>
      </DialogTrigger> */}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create User</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div>
						<FieldLabel>Name</FieldLabel>
						<Input
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							placeholder="Enter user name"
						/>
					</div>
					<div>
						<FieldLabel>Email</FieldLabel>
						<Input
							type="email"
							value={formData.email}
							onChange={(e) =>
								setFormData({ ...formData, email: e.target.value })
							}
							placeholder="Enter email address"
						/>
					</div>
					<div>
						<FieldLabel>Password</FieldLabel>
						<Input
							type="password"
							value={formData.password}
							onChange={(e) =>
								setFormData({ ...formData, password: e.target.value })
							}
							placeholder="Enter password"
						/>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={handleSubmit}>Create User</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
