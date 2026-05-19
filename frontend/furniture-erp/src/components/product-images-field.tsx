import { useId, useRef, useState, type ChangeEvent } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { useUploadProductImage } from "@/api-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { cn } from "@/lib/utils";

const MAX_MB = 4;

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function ProductImagesField({
  value,
  onChange,
  disabled,
  label = "Photos",
  className,
}: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const upload = useUploadProductImage();
  const [uploading, setUploading] = useState(false);

  const busy = disabled || uploading || upload.isPending;
  const images = Array.isArray(value) ? value.filter(Boolean) : [];

  const openPicker = () => {
    if (!busy) inputRef.current?.click();
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Choose an image file", variant: "destructive" });
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast({ title: `Image too large (max ${MAX_MB} MB)`, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const res = await upload.mutateAsync({ data: { image: file } });
      const url = res.imageUrl?.trim();
      if (!url) {
        throw new Error("Server did not return an image URL");
      }
      const current = Array.isArray(value) ? value.filter(Boolean) : [];
      onChange([...current, url]);
      toast({ title: "Image uploaded" });
    } catch (err: unknown) {
      toast({
        title: "Upload failed",
        description: String((err as { message?: string })?.message ?? err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeAt = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={busy}
        onChange={handleFile}
        tabIndex={-1}
        aria-hidden
      />
      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="relative aspect-square overflow-hidden rounded-lg border border-border/70 bg-muted/30"
            >
              <img
                src={resolvedProductImageUrl(url) ?? url}
                alt={`Photo ${index + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <button
                type="button"
                disabled={busy}
                className={cn(
                  "absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full",
                  "bg-destructive text-destructive-foreground shadow-md",
                  "hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  busy && "pointer-events-none opacity-50",
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeAt(index);
                }}
                aria-label={`Remove photo ${index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={openPicker}
            className={cn(
              "flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors",
              busy && "pointer-events-none opacity-50",
            )}
            aria-label="Add another photo"
          >
            <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={openPicker}
          className={cn(
            "flex aspect-[4/3] max-h-[160px] w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border/70 bg-muted/15 hover:bg-muted/25 transition-colors",
            busy && "pointer-events-none opacity-50",
          )}
        >
          <div className="flex flex-col items-center gap-2 text-center px-4">
            <ImageIcon className="h-8 w-8 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium text-muted-foreground">Add photos</span>
            <span className="text-xs text-muted-foreground">PNG or JPEG, max {MAX_MB} MB each</span>
          </div>
        </button>
      )}
      <Button type="button" variant="outline" size="sm" className="rounded-lg w-fit" disabled={busy} onClick={openPicker}>
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        {busy ? "Uploading…" : images.length > 0 ? "Add another photo" : "Upload photo"}
      </Button>
    </div>
  );
}
