import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

export function SearchInput({
  value,
  onChange,
  placeholder,
  debounce = 300,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  debounce?: number;
}) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const id = setTimeout(() => {
      if (local !== value) onChange(local);
    }, debounce);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder ?? t("common.search")}
        className="pl-9"
      />
    </div>
  );
}
