import { Button, FormLabel, Input } from "@autumn/ui";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
		<div className="w-full flex flex-col gap-4">
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div className="flex flex-col">
					<FormLabel>
						<span className="text-muted-foreground">Name</span>
					</FormLabel>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Your name"
					/>
				</div>
				<div className="flex flex-col">
					<FormLabel>
						<span className="text-muted-foreground">Email</span>
					</FormLabel>
					<Input
						value={user?.email || ""}
						disabled
						className="text-tertiary-foreground"
					/>
				</div>
			</div>
			<div>
				<Button
					variant="primary"
					disabled={!canSave}
					onClick={handleSave}
					isLoading={saving}
					className="min-w-20"
				>
					Save
				</Button>
			</div>
		</div>
	);
};
