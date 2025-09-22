import { PencilIcon, Trash2 } from "lucide-react"

export const PlanCardToolbar = () => {
    return <div className="flex flex-row items-center gap-2">
        <PencilIcon />
        <Trash2/>
    </div>
}