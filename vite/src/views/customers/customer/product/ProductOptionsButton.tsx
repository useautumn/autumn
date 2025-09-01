import { DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { useProductContext } from "@/views/products/product/ProductContext";

export const ProductOptionsButton = () => {
	const { product } = useProductContext();
	//   console.log(product);

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="gradientSecondary"
					className="w-fit gap-2"
					startIcon={<DollarSign size={12} />}
				>
					Configure Product Options
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Product Options</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					{/* {product.options.map((option) => (
            <div key={option.id} className="p-4 border rounded-lg">
              {option.name}
            </div>
          ))} */}
				</div>
			</DialogContent>
		</Dialog>
	);
};
