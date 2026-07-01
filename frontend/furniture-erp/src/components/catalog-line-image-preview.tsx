import { useMemo, useState, type MouseEvent } from "react";
import { ImageIcon } from "lucide-react";
import { OrderImageGalleryDialog, type GallerySlide } from "@/components/order-image-gallery-dialog";
import { productImageList, variantImageList } from "@/lib/image-urls";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { cn } from "@/lib/utils";

type ImageCarrier = {
  imageUrls?: string | string[] | null;
  imageUrl?: string | null;
};

export function catalogLineImageUrls(
  product?: ImageCarrier | null,
  variant?: ImageCarrier | null,
): string[] {
  const variantUrls = variant ? variantImageList(variant) : [];
  const productUrls = product ? productImageList(product) : [];
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...variantUrls, ...productUrls]) {
    const key = raw.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(key);
  }
  return merged;
}

function buildSlides(urls: string[], caption?: string): GallerySlide[] {
  return urls
    .map((raw) => resolvedProductImageUrl(raw))
    .filter((src): src is string => Boolean(src))
    .map((src, index) => ({
      src,
      caption:
        urls.length > 1 && caption
          ? `${caption} · ${index + 1}/${urls.length}`
          : caption ?? null,
    }));
}

type ThumbProps = {
  urls: string[];
  caption?: string;
  size?: "sm" | "md";
  className?: string;
  badgeCount?: number;
};

export function CatalogLineImageThumb({
  urls,
  caption,
  size = "md",
  className,
  badgeCount,
}: ThumbProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const slides = useMemo(() => buildSlides(urls, caption), [urls, caption]);
  const thumbSrc = slides[0]?.src;
  const dim = size === "sm" ? "h-9 w-9" : "h-14 w-14";
  const count = badgeCount ?? urls.length;

  if (!thumbSrc) {
    return (
      <div
        className={cn(
          dim,
          "shrink-0 overflow-hidden rounded-md border border-border/70 bg-muted/30 flex items-center justify-center text-muted-foreground",
          className,
        )}
        aria-hidden
      >
        <ImageIcon className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5", "opacity-60")} />
      </div>
    );
  }

  const openGallery = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIndex(0);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openGallery}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          dim,
          "relative shrink-0 overflow-hidden rounded-md border border-border/70 bg-muted/30",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        aria-label={count > 1 ? `View ${count} product photos` : "View product photo"}
      >
        <img src={thumbSrc} alt="" className="h-full w-full object-contain" loading="lazy" />
        {count > 1 ? (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/65 px-1 py-px text-[9px] font-semibold text-white">
            {count}
          </span>
        ) : null}
      </button>
      <OrderImageGalleryDialog
        open={open}
        slides={slides}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function CatalogLineImagePreview({
  product,
  variant,
  caption,
  size = "md",
  className,
}: {
  product?: ImageCarrier | null;
  variant?: ImageCarrier | null;
  caption?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const urls = catalogLineImageUrls(product, variant);
  if (urls.length === 0) return null;
  return (
    <CatalogLineImageThumb
      urls={urls}
      caption={caption}
      size={size}
      className={className}
    />
  );
}
