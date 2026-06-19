import type { CustomButton, OrgConfig } from "@autumn/shared";
import { useMutation } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { CustomButtonForm } from "./customButtonFormSchema";

export function useCustomButtons() {
	const axiosInstance = useAxiosInstance();
	const { org, mutate } = useOrg();
	const buttons = org?.config?.custom_buttons ?? [];

	const persist = (next: CustomButton[]) =>
		axiosInstance.patch("/organization/config", {
			custom_buttons: next,
		} satisfies Partial<OrgConfig>);

	const save = useMutation({
		mutationFn: ({
			id,
			values,
		}: {
			id: string | null;
			values: CustomButtonForm;
		}) => {
			const next = id
				? buttons.map((b) => (b.id === id ? { ...b, ...values } : b))
				: [...buttons, { id: nanoid(), ...values }];
			return persist(next);
		},
		onSuccess: (_data, { id }) => {
			mutate();
			toast.success(id ? "Button updated" : "Button added");
		},
		onError: () => toast.error("Failed to save button"),
	});

	const remove = useMutation({
		mutationFn: (id: string) => persist(buttons.filter((b) => b.id !== id)),
		onSuccess: () => {
			mutate();
			toast.success("Button removed");
		},
		onError: () => toast.error("Failed to remove button"),
	});

	return { buttons, save, remove };
}
