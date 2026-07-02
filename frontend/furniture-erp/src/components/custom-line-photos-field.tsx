import { useId, useRef, useState, type ChangeEvent } from "react";
import { ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { useUploadProductImage } from "@/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatUploadErrorMessage, validateImageFile } from "@/lib/upload-error-message";
import { resolvedProductImageUrl } from "@/lib/product-image-url";
import { cn } from "@/lib/utils";

const MAX_MB = 4;
const MAX_PHOTOS = 10;

export type CustomLinePhoto = { imageUrl: string; comment: string };

type Props = {
  value: CustomLinePhoto[];
  onChange: (next: CustomLinePhoto[]) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function CustomLinePhotosField({
  value,
  onChange,
  disabled,
  label = "Photos (optional)",
  className,
}: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const upload = useUploadProductImage();
  const [uploading, setUploading] = useState(false);
  const photos = Array.isArray(value) ? value : [];
  const busy = disabled || uploading || upload.isPending;
  const canAdd = photos.length < MAX_PHOTOS;

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateImageFile(file, MAX_MB);
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const res = await upload.mutateAsync({ data: { image: file } });
      const url = res.imageUrl?.trim();
      if (!url) throw new Error("Upload did not complete. Please try again.");
      onChange([...photos, { imageUrl: url, comment: "" }]);
      toast({ title: "Image uploaded" });
    } catch (err: unknown) {
      toast({
        title: "Upload failed",
        description: formatUploadErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl h-8"
          disabled={!canAdd || busy}
          onClick={() => inputRef.current?.click()}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add photo
        </Button>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e)}
        disabled={busy || !canAdd}
      />
      {photos.length === 0 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-muted-foreground transition-colors hover:bg-muted/35 disabled:opacity-60"
        >
          <ImageIcon className="h-8 w-8" />
          <span className="text-sm font-medium">Add a photo with comment</span>
        </button>
      ) : (
        <div className="space-y-3">
          {photos.map((row, index) => {
            const src = resolvedProductImageUrl(row.imageUrl);
            return (
              <div
                key={`${row.imageUrl}-${index}`}
                className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/10 p-3 sm:flex-row sm:items-start"
              >
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-background">
                  {src ? (
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Textarea
                    placeholder="Add a comment for this photo…"
                    value={row.comment}
                    onChange={(e) =>
                      onChange(
                        photos.map((item, i) =>
                          i === index ? { ...item, comment: e.target.value } : item,
                        ),
                      )
                    }
                    className="min-h-[72px] resize-y rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-lg text-destructive hover:text-destructive"
                    onClick={() => onChange(photos.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove photo
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
