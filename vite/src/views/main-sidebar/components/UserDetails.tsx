import { useMemo, useState } from "react";
import { toast } from "sonner";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { authClient, useSession } from "@/lib/auth-client";

export const UserDetails = () => {
	const { data: session, refetch } = useSession();
	const user = session?.user;

	const [name, setName] = useState(user?.name || "");
	const [saving, setSaving] = useState(false);

	const canSave = useMemo(() => {
		return name !== user?.name && name.trim() !== "";
	}, [name, user?.name]);

	const handleSave = async () => {
		try {
			setSaving(true);
			const { error } = await authClient.updateUser({
				name: name.trim(),
			});

			if (error) {
				toast.error(error.message || "Failed to update profile");
				return;
			}

			await refetch();
			toast.success("Successfully updated profile");
		} catch (error) {
			console.error(error);
			toast.error("Failed to update profile");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="px-6 pt-1.5 w-full h-full flex flex-col gap-4">
			<div className="w-full flex flex-col sm:flex-row gap-2 sm:gap-4">
				<div className="flex flex-col">
					<FieldLabel>Name</FieldLabel>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Your name"
					/>
				</div>
				<div className="flex flex-col">
					<FieldLabel>Email</FieldLabel>
					<Input value={user?.email || ""} disabled className="text-t3" />
				</div>
				<div>
					<FieldLabel>&nbsp;</FieldLabel>
					<Button
						variant="secondary"
						disabled={!canSave}
						onClick={handleSave}
						isLoading={saving}
						className="min-w-16"
					>
						Save
					</Button>
				</div>
			</div>
		</div>
	);
};
