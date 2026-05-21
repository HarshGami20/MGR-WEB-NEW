import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type GallerySlide = {
  src: string;
  caption?: string | null;
};

type OrderImageGalleryDialogProps = {
  open: boolean;
  slides: GallerySlide[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

export function OrderImageGalleryDialog({
  open,
  slides,
  index,
  onIndexChange,
  onClose,
}: OrderImageGalleryDialogProps) {
  const slide = slides[index];
  const hasMultiple = slides.length > 1;
  const caption = slide?.caption?.trim();
  const canGoPrev = index > 0;
  const canGoNext = index < slides.length - 1;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && canGoPrev) {
        onIndexChange(index - 1);
      } else if (e.key === "ArrowRight" && canGoNext) {
        onIndexChange(index + 1);
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, index, canGoPrev, canGoNext, onIndexChange, onClose]);

  if (!slide) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className={cn(
          "fixed left-3 top-3 z-50 flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none translate-x-0 translate-y-0",
          "flex-col gap-0 overflow-hidden border-0 bg-zinc-950 p-0 text-white shadow-2xl sm:rounded-xl",
          "[&>button]:right-3 [&>button]:top-3 [&>button]:z-40 [&>button]:text-white [&>button]:opacity-90",
          "[&>button]:hover:bg-white/10 [&>button]:hover:opacity-100",
        )}
        aria-describedby={caption ? "gallery-caption" : undefined}
      >
        {/* Main stage — image + absolute overlays */}
        <div className="relative min-h-0 flex-1 bg-black">
          <img
            src={slide.src}
            alt={caption ? `Photo ${index + 1}: ${caption}` : `Photo ${index + 1}`}
            className="absolute inset-0 h-full w-full select-none object-contain p-4 pb-28 pt-14 sm:p-8 sm:pb-32 sm:pt-16"
            draggable={false}
          />

          {/* Counter — absolute top-left */}
          <div className="absolute left-4 top-4 z-30 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm sm:text-sm">
            {hasMultiple ? (
              <>
                <span className="tabular-nums">{index + 1}</span>
                <span className="text-white/60"> / {slides.length}</span>
              </>
            ) : (
              "Photo"
            )}
          </div>

          {/* Comment — absolute above nav buttons */}
          {caption ? (
            <div
              id="gallery-caption"
              className={cn(
                "absolute inset-x-0 z-20 max-h-[36%] overflow-y-auto",
                "bg-gradient-to-t from-black/95 via-black/75 to-transparent",
                "px-5 pt-14 sm:px-8 sm:pt-16",
                hasMultiple ? "bottom-16 pb-3 sm:bottom-[4.5rem]" : "bottom-0 pb-5 sm:pb-6",
              )}
            >
              <p className="text-sm leading-relaxed text-white sm:text-base">{caption}</p>
            </div>
          ) : null}

          {/* Previous / Next — bottom center */}
          {hasMultiple ? (
            <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 sm:bottom-5">
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-auto min-h-10 gap-1.5 rounded-full border border-white/20 bg-black/65 px-4 py-2",
                  "text-white shadow-lg backdrop-blur-sm hover:bg-black/85 hover:text-white",
                  "disabled:pointer-events-none disabled:opacity-35",
                )}
                disabled={!canGoPrev}
                onClick={() => onIndexChange(index - 1)}
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-5 w-5 shrink-0" />
                <span className="text-sm font-medium">Previous</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-auto min-h-10 gap-1.5 rounded-full border border-white/20 bg-black/65 px-4 py-2",
                  "text-white shadow-lg backdrop-blur-sm hover:bg-black/85 hover:text-white",
                  "disabled:pointer-events-none disabled:opacity-35",
                )}
                disabled={!canGoNext}
                onClick={() => onIndexChange(index + 1)}
                aria-label="Next photo"
              >
                <span className="text-sm font-medium">Next</span>
                <ChevronRight className="h-5 w-5 shrink-0" />
              </Button>
            </div>
          ) : null}
        </div>

        {/* Thumbnail strip */}
        {hasMultiple ? (
          <div className="relative z-10 shrink-0 border-t border-white/10 bg-zinc-950/95 px-3 py-3 backdrop-blur-sm">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {slides.map((s, i) => (
                <button
                  key={`${s.src}-${i}`}
                  type="button"
                  onClick={() => onIndexChange(i)}
                  className={cn(
                    "relative h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition-all",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
                    i === index
                      ? "border-white ring-2 ring-white/40 opacity-100"
                      : "border-white/20 opacity-50 hover:opacity-90",
                  )}
                  aria-label={`View photo ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                >
                  <img src={s.src} alt="" className="h-full w-full object-cover" draggable={false} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
