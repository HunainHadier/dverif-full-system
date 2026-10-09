import logoMark from "@/assets/logo-mark.png";
import { cn } from "@/lib/utils";

export function Logo({
  showWordmark = true,
  className,
}: {
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img src={logoMark} alt="Dverif logo" className="h-8 w-8 rounded-md object-contain" />
      {showWordmark ? (
        <div className="flex flex-col leading-none">
          <span className="text-base font-semibold tracking-tight text-foreground">Dverif</span>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Verification
          </span>
        </div>
      ) : null}
    </div>
  );
}
