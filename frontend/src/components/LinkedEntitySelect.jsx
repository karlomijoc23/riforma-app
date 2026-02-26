import React, { useId } from "react";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const EMPTY_VALUE = "__none__";

const LinkedEntitySelect = ({
  label,
  placeholder = "",
  entities = [],
  value = "",
  onChange,
  renderLabel,
  allowNone = true,
  disabled = false,
  selectProps = {},
  testId,
}) => {
  const { id: providedId, ...restSelectProps } = selectProps || {};
  const generatedId = useId();
  const triggerId = providedId || `linked-entity-${generatedId}`;
  const labelId = label ? `${triggerId}-label` : undefined;

  const handleValueChange = (selected) => {
    if (allowNone && selected === EMPTY_VALUE) {
      onChange?.("");
      return;
    }
    onChange?.(selected);
  };

  const resolvedValue = allowNone ? value || EMPTY_VALUE : value || undefined;

  return (
    <div className="space-y-1.5">
      {label && (
        <Label
          id={labelId}
          htmlFor={triggerId}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </Label>
      )}
      <Select
        value={resolvedValue}
        onValueChange={handleValueChange}
        disabled={disabled}
        {...restSelectProps}
      >
        <SelectTrigger
          id={triggerId}
          aria-labelledby={labelId}
          data-testid={testId}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowNone && (
            <SelectItem value={EMPTY_VALUE}>{placeholder}</SelectItem>
          )}
          {entities.map((entity) => (
            <SelectItem key={entity.id} value={entity.id}>
              {renderLabel
                ? renderLabel(entity)
                : entity.naziv ||
                  entity.interna_oznaka ||
                  entity.name ||
                  entity.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default LinkedEntitySelect;
