import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Edit, Save, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "Sobre nós — Questão de Sucesso" }] }),
  component: AboutPage,
});

type AboutPageModel = {
  id: string;
  name: string;
  description: string | null;
  page_data_url: string;
  created_at?: string;
};

const ABOUT_PAGES_QUERY_KEY = ["about-pages"] as const;

function AboutPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const pagesQuery = useQuery({
    queryKey: ABOUT_PAGES_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("about_pages")
        .select("id, name, description, page_data_url, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AboutPageModel[];
    },
  });

  const pages = pagesQuery.data ?? [];
  const selected = pages.find((page) => page.id === selectedId) ?? null;
  const isEditing = Boolean(editingId);

  const savePage = useMutation({
    mutationFn: async () => {
      if (!pageImage) throw new Error("Envie a imagem A4 antes de salvar.");
      const pageName = name.trim() || fileName || "Página Sobre nós";
      const payload = { name: pageName, description: description.trim() || null, page_data_url: pageImage };

      if (editingId) {
        const { data, error } = await (supabase as any)
          .from("about_pages")
          .update(payload)
          .eq("id", editingId)
          .select("id, name, description, page_data_url, created_at")
          .single();
        if (error) throw error;
        return data as AboutPageModel;
      }

      const { data, error } = await (supabase as any)
        .from("about_pages")
        .insert(payload)
        .select("id, name, description, page_data_url, created_at")
        .single();
      if (error) throw error;
      return data as AboutPageModel;
    },
    onSuccess: async (saved) => {
      qc.setQueryData<AboutPageModel[]>(ABOUT_PAGES_QUERY_KEY, (current = []) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedId(saved.id);
      clearForm();
      await qc.invalidateQueries({ queryKey: ABOUT_PAGES_QUERY_KEY });
      toast.success(isEditing ? "Página atualizada" : "Página salva");
    },
    onError: (e: any) => toast.error(`Erro ao salvar página: ${e.message}`),
  });

  const deletePage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("about_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, deletedId) => {
      qc.setQueryData<AboutPageModel[]>(ABOUT_PAGES_QUERY_KEY, (current = []) => current.filter((item) => item.id !== deletedId));
      if (selectedId === deletedId) setSelectedId(null);
      if (editingId === deletedId) clearForm();
      await qc.invalidateQueries({ queryKey: ABOUT_PAGES_QUERY_KEY });
      toast.success("Página excluída");
    },
    onError: (e: any) => toast.error(`Erro ao excluir página: ${e.message}`),
  });

  function clearForm() {
    setName("");
    setDescription("");
    setPageImage(null);
    setFileName("");
    setEditingId(null);
  }

  function startEdit(page: AboutPageModel) {
    setEditingId(page.id);
    setSelectedId(page.id);
    setName(page.name);
    setDescription(page.description ?? "");
    setPageImage(page.page_data_url);
    setFileName(page.name);
    toast.info("Dados carregados para edição.");
  }

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem.");
      return;
    }
    try {
      setPageImage(await fileToCompressedDataUrl(file));
      setFileName(file.name);
      if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ""));
      toast.success("Imagem carregada. Confira a pré-visualização antes de salvar.");
    } catch (e: any) {
      toast.error(e.message || "Não foi possível carregar a imagem.");
    }
  }

  function confirmDeleteSelected() {
    if (!selected) return;
    if (!confirm(`Excluir a página "${selected.name}"? Essa ação não pode ser desfeita.`)) return;
    deletePage.mutate(selected.id);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Sobre nós</h1>
          <p className="text-muted-foreground">
            Cadastre páginas A4 que poderão entrar no arquivo final após a capa e antes da página do nível 1.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>{isEditing ? "Editar página" : "Nova página"}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Apresentação do projeto" />
              </div>
              <div>
                <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleUpload(event.target.files?.[0])} />
                <Label>Imagem A4</Label>
                <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="mt-2 w-full">
                  <UploadCloud className="h-4 w-4 mr-2" /> Escolher imagem
                </Button>
              </div>
              <Button onClick={() => savePage.mutate()} disabled={!pageImage || savePage.isPending}>
                <Save className="h-4 w-4 mr-2" /> {savePage.isPending ? "Salvando..." : "Salvar página"}
              </Button>
              <Button variant="outline" onClick={clearForm} disabled={!pageImage && !name && !description}>Limpar</Button>
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição interna para identificar esta página" />
            </div>

            {pageImage && (
              <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>Imagem carregada: <strong>{fileName || name}</strong></span>
                  <Button size="sm" variant="ghost" onClick={clearForm}><X className="h-4 w-4 mr-1" />Cancelar/Limpar</Button>
                </div>
                <div className="mx-auto aspect-[1055/1491] max-h-[60vh] overflow-hidden rounded-xl border bg-muted shadow">
                  <img src={pageImage} alt="Pré-visualização" className="h-full w-full object-fill" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Páginas cadastradas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-start">
              <div className="overflow-x-auto rounded-md border bg-muted/20 p-3">
                <div className="flex gap-3 pb-1">
                  {pages.map((page) => {
                    const active = page.id === selected?.id;
                    return (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => setSelectedId(page.id)}
                        onDoubleClick={() => startEdit(page)}
                        className={`w-32 shrink-0 rounded-md border p-2 text-left transition ${active ? "border-secondary ring-2 ring-secondary" : "border-border hover:border-primary"}`}
                      >
                        <div className="aspect-[1055/1491] overflow-hidden rounded bg-muted">
                          <img src={page.page_data_url} alt={page.name} className="h-full w-full object-fill" />
                        </div>
                        <div className="mt-2 line-clamp-2 text-xs font-medium text-primary">{page.name}</div>
                      </button>
                    );
                  })}
                  {pages.length === 0 && !pagesQuery.isLoading && <div className="py-6 text-sm text-muted-foreground">Nenhuma página cadastrada.</div>}
                  {pagesQuery.isLoading && <div className="py-6 text-sm text-muted-foreground">Carregando páginas...</div>}
                </div>
              </div>
              <Button variant="outline" disabled={!selected} onClick={() => selected && startEdit(selected)}>
                <Edit className="h-4 w-4 mr-2" /> Editar
              </Button>
              <Button variant="outline" disabled={!selected || deletePage.isPending} onClick={confirmDeleteSelected}>
                <Trash2 className="h-4 w-4 mr-2 text-destructive" /> {deletePage.isPending ? "Excluindo..." : "Excluir"}
              </Button>
            </div>

            {selected && (
              <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                <div className="rounded-md border bg-muted/20 p-4 text-sm">
                  <div className="font-semibold text-primary">{selected.name}</div>
                  <p className="mt-2 text-muted-foreground whitespace-pre-wrap">{selected.description || "Sem descrição."}</p>
                </div>
                <div className="mx-auto aspect-[1055/1491] max-h-[65vh] overflow-hidden rounded-xl border bg-muted shadow">
                  <img src={selected.page_data_url} alt={selected.name} className="h-full w-full object-fill" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

async function fileToCompressedDataUrl(file: File) {
  const source = await fileToDataUrl(file);
  const img = await loadImage(source);
  const maxW = 1200;
  const scale = Math.min(1, maxW / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.84);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    img.src = src;
  });
}
