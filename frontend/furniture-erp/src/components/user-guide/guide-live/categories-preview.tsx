import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GuideTarget } from "@/components/user-guide/guide-target";
import { LivePageRoot } from "@/components/user-guide/guide-live/shared";
import { DUMMY } from "@/lib/user-guide/mock-data";
import { Edit, FolderTree, Plus, Trash2 } from "lucide-react";

type CategoriesPreviewProps = {
  screenId: string;
  activeHighlight: string | null;
};

function CategoriesTable({
  activeHighlight,
  highlightRowId,
}: {
  activeHighlight: string | null;
  highlightRowId?: number;
}) {
  return (
    <GuideTarget id="data-table" activeHighlight={activeHighlight} label="Categories table">
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="whitespace-nowrap">Type</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead className="text-right whitespace-nowrap">Subcategories</TableHead>
              <TableHead className="w-[140px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {DUMMY.categories.map((row) => (
              <TableRow key={row.id} className={highlightRowId === row.id ? "bg-primary/5" : undefined}>
                <TableCell>
                  <div style={{ paddingLeft: `${row.level * 20}px` }} className="flex items-center gap-2 min-w-0">
                    {row.level > 0 ? (
                      <span className="text-muted-foreground shrink-0" aria-hidden>
                        └
                      </span>
                    ) : null}
                    <span className="font-medium truncate">{row.name}</span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {row.level === 0 ? (
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                      Main category
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted/50 text-muted-foreground">
                      Subcategory
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{row.parentName ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {row.level === 0 ? row.childCount : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <GuideTarget
                    id="table-actions"
                    activeHighlight={activeHighlight}
                    label="Row actions"
                    dimOthers={false}
                  >
                    <div className="inline-flex items-center justify-end gap-1">
                      {row.level === 0 ? (
                        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" disabled>
                          Add sub
                        </Button>
                      ) : null}
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled>
                        <Edit className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <GuideTarget
                        id="delete-action"
                        activeHighlight={activeHighlight}
                        label="Delete"
                        dimOthers={false}
                        className="inline-flex"
                      >
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </GuideTarget>
                    </div>
                  </GuideTarget>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </GuideTarget>
  );
}

function CategoriesPageHeader({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <GuideTarget id="page-header" activeHighlight={activeHighlight} label="Categories page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Categories</h2>
          <p className="text-muted-foreground">
            Add <span className="font-medium text-foreground">main categories</span> first, then add subcategories
            under them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GuideTarget
            id="header-action-add-main"
            activeHighlight={activeHighlight}
            label="Add main category"
            dimOthers={false}
          >
            <Button disabled>
              <Plus className="mr-2 h-4 w-4" />
              Add main category
            </Button>
          </GuideTarget>
          <GuideTarget
            id="header-action-add-sub"
            activeHighlight={activeHighlight}
            label="Add subcategory"
            dimOthers={false}
          >
            <Button variant="outline" disabled>
              <FolderTree className="mr-2 h-4 w-4" />
              Add subcategory
            </Button>
          </GuideTarget>
        </div>
      </div>
    </GuideTarget>
  );
}

function CategoryDialog({
  mode,
  activeHighlight,
}: {
  mode: "add-main" | "add-sub" | "edit-main" | "edit-sub";
  activeHighlight: string | null;
}) {
  const titles: Record<typeof mode, string> = {
    "add-main": "Add main category",
    "add-sub": "Add subcategory",
    "edit-main": "Edit main category",
    "edit-sub": "Edit subcategory",
  };
  const descriptions: Record<typeof mode, string> = {
    "add-main": "Create a new top-level category (e.g. Living Room, Bedroom).",
    "add-sub": "Add a subcategory under an existing main category (e.g. Sofas under Living Room).",
    "edit-main": "Main categories appear at the top level in product and filter lists.",
    "edit-sub": "Change the name or move this subcategory under another main category.",
  };
  const showParent = mode === "add-sub" || mode === "edit-sub";
  const saveLabel =
    mode === "add-main"
      ? "Create main category"
      : mode === "add-sub"
        ? "Create subcategory"
        : "Save changes";

  return (
    <GuideTarget id="category-dialog" activeHighlight={activeHighlight} label="Category dialog">
      <div className="rounded-lg border bg-card shadow-lg p-6 max-w-[425px] mx-auto mt-6 space-y-4">
        <div>
          <p className="font-semibold">{titles[mode]}</p>
          <p className="text-sm text-muted-foreground mt-1">{descriptions[mode]}</p>
        </div>

        <GuideTarget id="category-name" activeHighlight={activeHighlight} label="Category name" dimOthers={false}>
          <div className="space-y-2">
            <Label>{mode === "add-main" ? "Main category name" : "Name"}</Label>
            <Input
              readOnly
              placeholder={mode === "add-main" || mode === "edit-main" ? "e.g. Living Room" : "e.g. Sofas"}
              defaultValue={mode.startsWith("edit") ? (mode === "edit-main" ? "Living Room" : "Sofas") : ""}
              className="bg-background"
            />
          </div>
        </GuideTarget>

        {showParent ? (
          <GuideTarget id="parent-category" activeHighlight={activeHighlight} label="Main category" dimOthers={false}>
            <div className="space-y-2">
              <Label>Main category *</Label>
              <div className="h-9 rounded-md border bg-background px-3 flex items-center text-sm">
                Living Room
              </div>
            </div>
          </GuideTarget>
        ) : (
          <GuideTarget
            id="main-category-note"
            activeHighlight={activeHighlight}
            label="Main category note"
            dimOthers={false}
          >
            <p className="text-xs text-muted-foreground rounded-lg border bg-muted/30 px-3 py-2">
              This will be a <span className="font-medium text-foreground">main (top-level)</span> category.
            </p>
          </GuideTarget>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <GuideTarget id="form-cancel" activeHighlight={activeHighlight} label="Cancel" dimOthers={false}>
            <Button type="button" variant="outline" disabled>
              Cancel
            </Button>
          </GuideTarget>
          <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Save" dimOthers={false}>
            <Button type="button" disabled>
              {saveLabel}
            </Button>
          </GuideTarget>
        </div>
      </div>
    </GuideTarget>
  );
}

function DeleteCategoryDialog({
  activeHighlight,
  hasChildren = false,
}: {
  activeHighlight: string | null;
  hasChildren?: boolean;
}) {
  return (
    <GuideTarget id="delete-dialog" activeHighlight={activeHighlight} label="Delete confirmation">
      <div className="rounded-lg border bg-card shadow-lg p-6 max-w-md mx-auto mt-6 space-y-4">
        <div>
          <p className="font-semibold">Delete category?</p>
          <div className="space-y-2 text-sm text-muted-foreground mt-2">
            <p>
              Delete <span className="font-medium text-foreground">Living Room</span>?
            </p>
            {hasChildren ? (
              <p className="text-destructive">
                This category has 2 subcategories. Delete those first.
              </p>
            ) : (
              <p>Products using this category must be reassigned before deletion.</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={hasChildren}>
            Delete
          </Button>
        </div>
      </div>
    </GuideTarget>
  );
}

function CategoriesListPreview({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <LivePageRoot>
      <CategoriesPageHeader activeHighlight={activeHighlight} />
      <CategoriesTable activeHighlight={activeHighlight} />
    </LivePageRoot>
  );
}

export function GuideLiveCategoriesPreview({ screenId, activeHighlight }: CategoriesPreviewProps) {
  if (screenId === "categories-list") {
    return <CategoriesListPreview activeHighlight={activeHighlight} />;
  }

  if (screenId === "categories-add-main") {
    return (
      <LivePageRoot>
        <CategoriesPageHeader activeHighlight={activeHighlight} />
        <CategoriesTable activeHighlight={activeHighlight} />
        <CategoryDialog mode="add-main" activeHighlight={activeHighlight} />
      </LivePageRoot>
    );
  }

  if (screenId === "categories-add-sub") {
    return (
      <LivePageRoot>
        <CategoriesPageHeader activeHighlight={activeHighlight} />
        <CategoriesTable activeHighlight={activeHighlight} />
        <CategoryDialog mode="add-sub" activeHighlight={activeHighlight} />
      </LivePageRoot>
    );
  }

  if (screenId === "categories-edit") {
    return (
      <LivePageRoot>
        <CategoriesPageHeader activeHighlight={activeHighlight} />
        <CategoriesTable activeHighlight={activeHighlight} highlightRowId={2} />
        <CategoryDialog mode="edit-sub" activeHighlight={activeHighlight} />
      </LivePageRoot>
    );
  }

  if (screenId === "categories-delete") {
    return (
      <LivePageRoot>
        <CategoriesPageHeader activeHighlight={activeHighlight} />
        <CategoriesTable activeHighlight={activeHighlight} highlightRowId={1} />
        <DeleteCategoryDialog activeHighlight={activeHighlight} hasChildren />
      </LivePageRoot>
    );
  }

  return <CategoriesListPreview activeHighlight={activeHighlight} />;
}
