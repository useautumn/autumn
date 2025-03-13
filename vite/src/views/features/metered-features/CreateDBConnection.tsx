import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { SelectContent } from "@/components/ui/select";
import { SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";

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
    } catch (error) {
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
