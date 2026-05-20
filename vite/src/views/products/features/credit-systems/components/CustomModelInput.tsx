import { useState } from "react";
import { Input } from "@/components/v2/inputs/Input";

interface CustomModelInputProps {
	modelKey: string;
	onRename: (newKey: string) => void;
}

export function CustomModelInput({ modelKey, onRename }: CustomModelInputProps) {
	const [local, setLocal] = useState(modelKey);
	return (
		<Input
			variant="headless"
			value={local}
			onChange={(e) => setLocal(e.target.value)}
			onBlur={() => {
				if (local !== modelKey) onRename(local);
			}}
			placeholder="my-model-id"
			className="text-sm"
		/>
	);
}
