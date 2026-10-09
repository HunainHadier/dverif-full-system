import { Fragment } from "react";

export function FormattedLeaveReason({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {text.split(/\r?\n/).map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 ? <br /> : null}
          {line.split(/(\*\*.+?\*\*|__.+?__)/g).map((part, partIndex) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={partIndex}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith("__") && part.endsWith("__")) {
              return <u key={partIndex}>{part.slice(2, -2)}</u>;
            }
            return <Fragment key={partIndex}>{part}</Fragment>;
          })}
        </Fragment>
      ))}
    </span>
  );
}
