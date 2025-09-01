import { useState } from "react";
import { toast } from "sonner";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

function CreateDBConnection() {
	// const { env } = useFeatureContext();
	// const axiosInstance = useAxiosInstance({ env:  });
	const [fields, setFields] = useState({
		provider: "postgres",
		display_name: "",
		connection_string: "",
	});
	const [isLoading, setIsLoading] = useState(false);

	const handleChange = (e: any, field: string) => {
		setFields({ ...fields, [field]: e.target.value });
	};

	const handleSubmit = async () => {
		setIsLoading(true);
		try {
			// await FeatureService.createDBConnection(axiosInstance, fields);
		} catch (_error) {
			toast.error("Failed to create DB connection");
		}
		setIsLoading(false);
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button>Create DB connection</Button>
			</DialogTrigger>
			<DialogContent className="w-[500px]">
				<DialogHeader>
					<DialogTitle>Create DB connection</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex gap-4 w-full">
						<div className="w-full">
							<FieldLabel>Provider</FieldLabel>
							<Select
								value={fields.provider}
								onValueChange={(value) => handleChange(value, "provider")}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="postgres">PostgreSQL</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="w-full">
							<FieldLabel>Display Name</FieldLabel>
							<Input
								placeholder="Display Name"
								value={fields.display_name}
								onChange={(e) => handleChange(e, "display_name")}
							/>
						</div>
					</div>
					<div>
						<FieldLabel>Connection String</FieldLabel>
						<Input
							placeholder="DB connection URL"
							value={fields.connection_string}
							onChange={(e) => handleChange(e, "connection_string")}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={handleSubmit} isLoading={isLoading}>
						Create
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default CreateDBConnection;
