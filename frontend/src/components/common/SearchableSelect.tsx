import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableSelectItem = {
  value: string;
  label: string;
  hint?: string;
  /**
   * Extra text the search box matches against but never renders.
   *
   * Needed wherever the thing a user searches for is not the thing they read:
   * an employee is picked by name but looked up by email or CNIC.
   */
  keywords?: string;
};

/** Everything the search box may match, and nothing it must not. */
const searchValue = (item: SearchableSelectItem) =>
  [item.label, item.hint, item.keywords].filter(Boolean).join(" ");

export function SearchableSelect({
  items,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText = "No results found.",
  className,
  search,
  onSearchChange,
}: {
  items: SearchableSelectItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  /** Pass both to control the search box from the caller. */
  search?: string;
  onSearchChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [uncontrolledSearch, setUncontrolledSearch] = useState("");
  const selected = items.find((i) => i.value === value);

  const query = search ?? uncontrolledSearch;
  const handleSearch = (next: string) => {
    setUncontrolledSearch(next);
    onSearchChange?.(next);
  };

  // A filter left over from the last open reopens the list already narrowed, so
  // an option that IS in the list looks like it is missing.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) handleSearch("");
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-10 w-full justify-between font-normal", className)}
        >
          {selected ? (
            <span className="truncate">
              {selected.label}
              {selected.hint ? (
                <span className="ml-1 text-xs text-muted-foreground">{selected.hint}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder ?? "Select…"}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            value={query}
            onValueChange={handleSearch}
            placeholder={searchPlaceholder ?? "Search…"}
            className="h-9"
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={searchValue(item)}
                  onSelect={() => {
                    onChange(item.value);
                    handleOpenChange(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === item.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                  {item.hint ? (
                    <span className="ml-auto pl-3 text-xs text-muted-foreground">{item.hint}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
