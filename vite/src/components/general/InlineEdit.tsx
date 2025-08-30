import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X, Edit } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineEditProps {
  value: string;
  onSave: (value: string) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  validation?: (value: string) => string | null;
  maxLength?: number;
  minLength?: number;
}

export const InlineEdit = ({
  value,
  onSave,
  onCancel,
  placeholder = "Enter value...",
  className,
  disabled = false,
  validation,
  maxLength = 50,
  minLength = 3,
}: InlineEditProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const validateInput = (input: string): string | null => {
    if (input.length < minLength) {
      return `Must be at least ${minLength} characters`;
    }
    if (input.length > maxLength) {
      return `Must be at most ${maxLength} characters`;
    }
    if (validation) {
      return validation(input);
    }
    return null;
  };

  const handleStartEdit = () => {
    if (disabled) return;
    setIsEditing(true);
    setError(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue(value);
    setError(null);
    onCancel?.();
  };

  const handleSave = async () => {
    const validationError = validateInput(editValue);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex-1">
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(error && "border-red-500")}
            disabled={isSaving}
          />
          {error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleSave}
          disabled={isSaving}
          className="h-8 w-8 p-0"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          disabled={isSaving}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 group", className)}>
      <span className="flex-1">{value || placeholder}</span>
      {!disabled && (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleStartEdit}
          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Edit className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};
