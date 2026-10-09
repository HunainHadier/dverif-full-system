import { cn } from "@/lib/utils";

type QuotaRingProps = {
  used: number;
  total: number;
  label: string;
  sublabel?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  tone?: "muted" | "accent";
};

export function QuotaRing({
  used,
  total,
  label,
  sublabel,
  size = 84,
  strokeWidth = 9,
  className,
  tone = "muted",
}: QuotaRingProps) {
  const safeTotal = total > 0 ? total : 1;
  const fraction = Math.min(1, Math.max(0, used / safeTotal));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fraction);
  const center = size / 2;

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-1",
        className,
      )}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-border/80"
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={tone === "accent" ? "stroke-primary/75" : "stroke-muted-foreground/70"}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {used}
            <span className="text-xs font-normal text-muted-foreground"> / {total}</span>
          </span>
        </div>
      </div>
      <div className="min-w-0 text-center">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {sublabel ? (
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        ) : null}
      </div>
    </div>
  );
}
