import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { cn } from "@/lib/utils";

type Props = {
  urls: string[];
  editHref?: string;
  canEdit?: boolean;
  title?: string;
  className?: string;
};

export function ProductImageGallery({ urls, editHref, canEdit, title = "Photos", className }: Props) {
  const resolved = urls.map((u) => resolvedProductImageUrl(u)).filter(Boolean) as string[];
  const [active, setActive] = useState(0);
  const current = resolved[active];

  if (resolved.length === 0) {
    return (
      <section className={cn("mt-8", className)} aria-label={title}>
        <h2 className="text-lg font-semibold text-foreground mb-3">{title}</h2>
        <div className="overflow-hidden w-fit max-w-full border border-border/60 bg-card shadow-sm rounded-xl">
          <div className="flex flex-col items-center justify-center gap-2 py-16 px-8 bg-muted/15 text-muted-foreground min-w-[240px]">
            <ImageIcon className="h-10 w-10 opacity-40" aria-hidden />
            <p className="text-sm text-center">No photos yet.</p>
            {canEdit && editHref ? (
              <Link href={editHref}>
                <Button type="button" variant="outline" size="sm" className="rounded-lg mt-1">
                  Add photos when editing
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={cn("mt-8", className)} aria-label={title}>
      <h2 className="text-lg font-semibold text-foreground mb-3">
        {title}
        {resolved.length > 1 ? (
          <span className="ml-2 text-sm font-normal text-muted-foreground">({resolved.length})</span>
        ) : null}
      </h2>
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden max-w-2xl">
        <div className="bg-muted/15 flex items-center justify-center min-h-[200px] max-h-[min(420px,55vh)]">
          {current ? (
            <img src={current} alt="" className="max-h-[min(420px,55vh)] w-full object-contain" loading="lazy" />
          ) : null}
        </div>
        {resolved.length > 1 ? (
          <div className="flex gap-2 p-3 overflow-x-auto border-t border-border/60 bg-muted/10">
            {resolved.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                  i === active ? "border-primary ring-2 ring-primary/20" : "border-border/60 opacity-80 hover:opacity-100",
                )}
              >
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
