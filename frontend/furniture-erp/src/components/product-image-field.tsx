import { useRef, type ChangeEvent } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { useUploadProductImage } from "@/api-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { cn } from "@/lib/utils";

const MAX_MB = 4;

export function ProductImageField({
  value,
  onChange,
  disabled,
  label = "Photo",
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadProductImage();
  const preview = resolvedProductImageUrl(value);

  const busy = disabled || upload.isPending;

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
    try {
      const res = await upload.mutateAsync({ data: { image: file } });
      onChange(res.imageUrl);
      toast({ title: "Image uploaded" });
    } catch (err: unknown) {
      toast({
        title: "Upload failed",
        description: String((err as { message?: string })?.message ?? err),
        variant: "destructive",
      });
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={cn(
            "relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/30",
            preview && "border-primary/40",
          )}
        >
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <ImagePlus className="h-8 w-8 text-muted-foreground/70" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={handleFile}
          />
          <Button type="button" variant="outline" size="sm" disabled={busy} className="w-fit rounded-lg" onClick={() => inputRef.current?.click()}>
            {busy ? "Uploading…" : preview ? "Replace image" : "Upload image"}
          </Button>
          {preview ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 w-fit text-destructive" disabled={busy} onClick={() => onChange("")}>
              <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
              Remove
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground max-w-[220px]">PNG or JPEG, max {MAX_MB} MB.</p>
          )}
        </div>
      </div>
    </div>
  );
}
