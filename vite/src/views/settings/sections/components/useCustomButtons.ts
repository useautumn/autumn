import type { CustomButton } from "@autumn/shared";
import { useMutation } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { CustomButtonForm } from "./customButtonFormSchema";

type CustomButtonsResponse = { custom_buttons: CustomButton[] };

export function useCustomButtons() {
	const axiosInstance = useAxiosInstance();
	const { org, mutate } = useOrg();
	const buttons = org?.custom_buttons ?? [];

	const persist = (next: CustomButton[]) =>
		axiosInstance.patch("/organization/custom-buttons", {
			custom_buttons: next,
		});

	const fetchButtons = async (): Promise<CustomButton[]> => {
		const { data } = await axiosInstance.get<CustomButtonsResponse>(
			"/organization/custom-buttons",
		);
		return data.custom_buttons ?? [];
	};

	const save = useMutation({
		mutationFn: async ({
			id,
			values,
		}: {
			id: string | null;
			values: CustomButtonForm;
		}) => {
			const current = await fetchButtons();
			const next = id
				? current.map((b) => (b.id === id ? { ...b, ...values } : b))
				: [...current, { id: nanoid(), ...values }];
			return persist(next);
		},
		onSuccess: (_data, { id }) => {
			mutate();
			toast.success(id ? "Button updated" : "Button added");
		},
		onError: () => toast.error("Failed to save button"),
	});

	const remove = useMutation({
		mutationFn: async (id: string) => {
			const current = await fetchButtons();
			return persist(current.filter((b) => b.id !== id));
		},
		onSuccess: () => {
			mutate();
			toast.success("Button removed");
		},
		onError: () => toast.error("Failed to remove button"),
	});

	return { buttons, save, remove };
}
