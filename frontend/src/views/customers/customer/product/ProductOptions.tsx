import { Input } from "@/components/ui/input"

export const ProductOptions = ({ options }: { options: any[] }) => {
    return (
        <div className="">
            <p className="text-md text-t2 font-medium mb-3">Options</p>
            {options.map((option) => (
                <div 
                    key={option.internal_feature_id}
                    className="flex gap-16 bg-white rounded-md border p-4 items-center "
                >
                    <p className="text-sm text-t1">{option.feature_id}</p>
                    <div className="flex gap-4">
                        {option.threshold && (
                            <div className="flex items-center gap-2">
                                <label htmlFor={`threshold-${option.internal_feature_id}`} className="text-sm text-t2">Billing Threshold</label>
                                <Input 
                                    id={`threshold-${option.internal_feature_id}`}
                                    value={option.threshold} 
                                    disabled 
                                    className="w-24 h-8"
                                />
                            </div>
                        )}
                        {option.quantity && (
                            <div className="flex items-center gap-2">
                                <label htmlFor={`quantity-${option.internal_feature_id}`} className="text-sm text-t2">Billing Quantity</label>
                                <Input 
                                    id={`quantity-${option.internal_feature_id}`}
                                    value={option.quantity} 
                                    disabled 
                                    className="w-24 h-8"
                                />
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}