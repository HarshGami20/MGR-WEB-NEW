import { ExternalLink } from "lucide-react";
import { parseAddressParts } from "@/lib/address-or-link";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  className?: string;
  linkClassName?: string;
};

export function AddressOrLink({ text, className, linkClassName }: Props) {
  const parts = parseAddressParts(text);
  if (parts.length === 0) return null;

  const onlyLink = parts.length === 1 && parts[0]?.type === "link";

  return (
    <span className={cn("leading-snug whitespace-pre-wrap break-words", className)}>
      {parts.map((part, i) =>
        part.type === "link" ? (
          <a
            key={`${part.href}-${i}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-start gap-1 text-primary underline underline-offset-2 hover:text-primary/80",
              onlyLink && "font-medium",
              linkClassName,
            )}
          >
            <span className="break-all">{part.value}</span>
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          </a>
        ) : (
          <span key={`text-${i}`}>{part.value}</span>
        ),
      )}
    </span>
  );
}
