import React, { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

/**
 * Searchable multi-select list with optional filter chips and a "selected
 * items" summary row of removable pills.
 *
 * Props:
 *   items         — array of objects to choose from
 *   selectedIds   — array of currently-selected ids
 *   getId         — (item) => unique id (default: item.id)
 *   getLabel      — (item) => primary label string (used for search + pills)
 *   getSearchText — (item) => string to search in (default: getLabel(item))
 *   isDisabled    — (item) => true if the item must not be toggled
 *   disabledHint  — (item) => string explaining why it's disabled (optional)
 *   renderPrimary — (item) => JSX node for the main row content
 *   renderSecondary — (item) => optional JSX shown below primary
 *   filters       — optional array of { key, label } for chip filters
 *   filterPredicate — (item, activeFilterKey) => bool; required if filters set
 *   onToggle      — (id) => void
 *   placeholder   — search input placeholder
 *   emptyMessage  — string shown when nothing matches the filter
 *   maxHeight     — px height for the scrollable list (default: 240)
 */
const MultiSelectList = ({
  items,
  selectedIds = [],
  getId = (item) => item.id,
  getLabel,
  getSearchText,
  isDisabled = () => false,
  disabledHint,
  renderPrimary,
  renderSecondary,
  filters,
  filterPredicate,
  onToggle,
  placeholder = "Pretraži…",
  emptyMessage = "Nema rezultata.",
  maxHeight = 240,
}) => {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState(
    filters && filters.length ? filters[0].key : null,
  );

  const searchFn = getSearchText || getLabel;

  const filtered = useMemo(() => {
    let list = items;
    if (filters && activeFilter && filterPredicate) {
      list = list.filter((item) => filterPredicate(item, activeFilter));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((item) => {
        const text = (searchFn(item) || "").toString().toLowerCase();
        return text.includes(q);
      });
    }
    return list;
  }, [items, filters, activeFilter, filterPredicate, query, searchFn]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(getId(item))),
    [items, selectedIds, getId],
  );

  return (
    <div className="space-y-2">
      {/* Selected pills */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <button
              key={getId(item)}
              type="button"
              onClick={() => onToggle(getId(item))}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium hover:bg-primary/20"
              title="Ukloni iz odabira"
            >
              {getLabel(item)}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-9 h-9"
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={() => setQuery("")}
            tabIndex={-1}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Filter chips */}
      {filters && filters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilter(f.key)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
                activeFilter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div
        className="rounded-md border overflow-y-auto divide-y"
        style={{ maxHeight }}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          filtered.map((item) => {
            const id = getId(item);
            const checked = selectedIds.includes(id);
            const disabled = isDisabled(item);
            const hint = disabledHint ? disabledHint(item) : null;
            return (
              <label
                key={id}
                className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/40 ${
                  disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(id)}
                />
                <div className="flex-1 text-sm min-w-0">
                  <div className="truncate">
                    {renderPrimary ? renderPrimary(item) : getLabel(item)}
                  </div>
                  {renderSecondary && (
                    <div className="text-xs text-muted-foreground">
                      {renderSecondary(item)}
                    </div>
                  )}
                  {disabled && hint && (
                    <div className="text-xs text-amber-700 mt-0.5">{hint}</div>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>

      {/* Result counter */}
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>
          Prikazano {filtered.length} od {items.length}
        </span>
        {selectedItems.length > 0 && (
          <span>Odabrano: {selectedItems.length}</span>
        )}
      </div>
    </div>
  );
};

export default MultiSelectList;
