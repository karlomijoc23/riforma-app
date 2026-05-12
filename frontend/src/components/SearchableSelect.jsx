import React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

/**
 * Searchable single-select built on cmdk + Popover.
 *
 * Props:
 *   items       — [{ value, label, hint? }]
 *   value       — currently selected `value` string
 *   onChange    — (value) => void
 *   placeholder — trigger label when nothing selected
 *   searchPlaceholder — input placeholder
 *   emptyMessage — shown when no match
 *   disabled
 *   required
 *
 * Designed as a drop-in replacement for a plain Select when the list
 * has >20 items and search-as-you-type matters (e.g. zakupnici, nekretnine).
 */
const SearchableSelect = ({
  items = [],
  value,
  onChange,
  placeholder = "Odaberi…",
  searchPlaceholder = "Pretraži…",
  emptyMessage = "Nema rezultata.",
  disabled = false,
  required = false,
  className,
  id,
}) => {
  const [open, setOpen] = React.useState(false);
  const selected = items.find((item) => item.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={`${item.label} ${item.hint || ""}`}
                  onSelect={() => {
                    onChange(item.value === value ? "" : item.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      item.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    {item.hint && (
                      <span className="text-xs text-muted-foreground">
                        {item.hint}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SearchableSelect;
