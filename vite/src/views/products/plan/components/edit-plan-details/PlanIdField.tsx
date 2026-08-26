import { FormLabel, IconButton, Input } from "@autumn/ui";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { slugify } from "@/utils/formatUtils/formatTextUtils";

export const PlanIdField = () => {
	const { product, setProduct } = useProduct();
	const [idUnlocked, setIdUnlocked] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const unlockId = () => {
		setIdUnlocked(true);
		queueMicrotask(() => inputRef.current?.focus());
	};

	return (
		<div>
			<div className="flex items-center justify-between gap-1">
				<FormLabel>ID</FormLabel>
				{!idUnlocked && (
					<IconButton
						aria-label="Edit plan ID"
						icon={<PencilSimpleIcon />}
						iconOrientation="center"
						onClick={unlockId}
						size="mini"
						variant="muted"
					/>
				)}
			</div>
			<Input
				disabled={!idUnlocked}
				onChange={(event) =>
					setProduct({ ...product, id: slugify(event.target.value) })
				}
				placeholder="fills automatically"
				ref={inputRef}
				value={product.id}
			/>
		</div>
	);
};
