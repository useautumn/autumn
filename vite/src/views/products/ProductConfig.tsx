import type { ProductV2 } from "@autumn/shared";
import { useState } from "react";
import { FormLabel as FieldLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";

export const ProductConfig = ({
	product,
	setProduct,
	isUpdate = false,
}: {
	product: ProductV2;
	setProduct: (product: ProductV2) => void;
	isUpdate?: boolean;
}) => {
	const [idEdit, setIdEdit] = useState(false);

	const { setSource, setTarget } = useAutoSlug({
		state: product,
		setState: setProduct,
		sourceKey: "name",
		targetKey: "id",
		disableAutoSlug: isUpdate,
	});

	return (
		<div className="flex w-full gap-4 items-center">
			<div className="flex flex-col flex-1">
				<FieldLabel className="mb-1">Name</FieldLabel>
				<Input
					placeholder="eg. Starter Product"
					value={product.name}
					onChange={(e) => {
						setSource(e.target.value);
					}}
				/>
			</div>
			<div className="flex flex-col flex-1">
				<FieldLabel className="mb-1">ID</FieldLabel>
				<div className="flex items-center">
					<Input
						autoFocus={idEdit}
						placeholder="eg. Product ID"
						// disabled={!idEdit}
						className="disabled:bg-transparent disabled:border-none disabled:shadow-none"
						value={product.id}
						onChange={(e) => {
							setTarget(e.target.value);
						}}
					/>
					{/* <Pencil
						size={12}
						className="text-t3 cursor-pointer w-8 h-8 px-2 hover:text-[#8231FF]"
						onClick={() => setIdEdit(!idEdit)}
					/> */}
				</div>
			</div>
		</div>
	);
};
