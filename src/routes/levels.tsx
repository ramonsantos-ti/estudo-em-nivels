import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Save, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { uploadImageFile, deleteImageByUrl } from "@/lib/storage-uploads";

export const Route = createFileRoute("/levels")({
  head: () => ({ meta: [{ title: "Níveis — Questão de Sucesso" }] }),
  component: LevelsPage,
});

type LevelPage = {
  id: string;
  level: number;
  name: string;
  page_data_url: string;
  created_at?: string;
};

const LEVEL_PAGES_QUERY_KEY = ["level-pages"] as const;

function LevelsPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [level, setLevel] = useState("1");
  const [name, setName] = useState("");
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [viewLevel, setViewLevel] = useState("1");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const pagesQuery = useQuery({
    queryKey: LEVEL_PAGES_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("level_pages")
        .select("id, level, name, page_data_url, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LevelPage[];
    },
  });

  const pages = pagesQuery.data ?? [];
  const visiblePages = pages.filter((page) => String(page.level) === viewLevel);
  const selected = visiblePages.find((page) => page.id === selectedId) ?? null;
  const isEditing = Boolean(editingId);

  const savePage = useMutation({
    mutationFn: async () => {
      if (!pageImage) throw new Error("Envie a imagem da página do nível antes de salvar.");
      const levelNumber = Number(level);
      const pageName = name.trim() || `Página do nível ${levelNumber}`;

      if (editingId) {
        const { data, error } = await (supabase as any)
          .from("level_pages")
          .update({ level: levelNumber, name: pageName, page_data_url: pageImage })
          .eq("id", editingId)
          .select("id, level, name, page_data_url, created_at")
          .single();
        if (error) throw error;
        return data as LevelPage;
      }

      const { data, error } = await (supabase as any)
        .from("level_pages")
        .insert({ level: levelNumber, name: pageName, page_data_url: pageImage })
        .select("id, level, name, page_data_url, created_at")
        .single();
      if (error) throw error;
      return data as LevelPage;
    },
    onSuccess: async (saved) => {
      qc.setQueryData<LevelPage[]>(LEVEL_PAGES_QUERY_KEY, (current = []) => {
        const withoutCurrent = current.filter((item) => item.id !== saved.id);
        return [saved, ...withoutCurrent];
      });
      setViewLevel(String(saved.level));
      setSelectedId(saved.id);
      clearForm();
      await qc.invalidateQueries({ queryKey: LEVEL_PAGES_QUERY_KEY });
      toast.success(isEditing ? "Página de nível atualizada" : "Página de nível salva");
    },
    onError: (e: any) => toast.error(`Erro ao salvar página: ${e.message}`),
  });

  const deletePage = useMutation({
    mutationFn: async (id: string) => {
      const target = pages.find((p) => p.id === id);
      const { error } = await (supabase as any).from("level_pages").delete().eq("id", id);
      if (error) throw error;
      await deleteImageByUrl(target?.page_data_url);
    },
    onSuccess: async (_, deletedId) => {
      qc.setQueryData<LevelPage[]>(LEVEL_PAGES_QUERY_KEY, (current = []) => current.filter((item) => item.id !== deletedId));
      if (selectedId === deletedId) setSelectedId(null);
      if (editingId === deletedId) clearForm();
      await qc.invalidateQueries({ queryKey: LEVEL_PAGES_QUERY_KEY });
      toast.success("Página excluída");
    },
    onError: (e: any) => toast.error(`Erro ao excluir página: ${e.message}`),
  });

  function clearForm() {
    setName("");
    setPageImage(null);
    setFileName("");
    setEditingId(null);
    setLevel("1");
  }

  function startEdit(page: LevelPage) {
    setEditingId(page.id);
    setSelectedId(page.id);
    setViewLevel(String(page.level));
    setLevel(String(page.level));
    setName(page.name);
    setPageImage(page.page_data_url);
    setFileName(page.name);
    toast.info("Dados carregados para edição. Altere as informações e clique em Salvar página.");
  }

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem.");
      return;
    }
    try {
      const url = await uploadImageFile(file, "level_pages");
      setPageImage(url);
      setFileName(file.name);
      if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ""));
      toast.success("Imagem carregada. Confira a pré-visualização antes de salvar.");
    } catch (e: any) {
      toast.error(e.message || "Não foi possível carregar a imagem.");
    }
  }

  function confirmDeleteSelected() {
    if (!selected) return;
    if (!confirm(`Excluir a página "${selected.name}" do nível ${selected.level}? Essa ação não pode ser desfeita.`)) return;
    deletePage.mutate(selected.id);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Níveis</h1>
          <p className="text-muted-foreground">
            Cadastre páginas de abertura para cada nível. Na exportação, se houver questões daquele nível, a página será incluída antes das questões do nível.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isEditing ? "Editar página de nível" : "Nova página de nível"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[220px_1fr_auto_auto] md:items-end">
              <div>
                <Label>Nível</Label>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>Nível {n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nome da página</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Abertura - Nível 1" />
              </div>
              <div>
                <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleUpload(event.target.files?.[0])} />
                <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                  <UploadCloud className="h-4 w-4 mr-2" /> Escolher imagem
                </Button>
              </div>
              <Button onClick={() => savePage.mutate()} disabled={!pageImage || savePage.isPending}>
                <Save className="h-4 w-4 mr-2" /> {savePage.isPending ? "Salvando..." : "Salvar página"}
              </Button>
            </div>

            {isEditing && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                Editando página cadastrada. Você pode alterar o nível, o nome e substituir a imagem antes de salvar.
              </div>
            )}

            {pageImage && (
              <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>Imagem carregada: <strong>{fileName || name}</strong></span>
                  <Button size="sm" variant="ghost" onClick={clearForm}><X className="h-4 w-4 mr-1" />Cancelar/Limpar</Button>
                </div>
                <div className="mx-auto aspect-[1055/1491] max-h-[60vh] overflow-hidden rounded-xl border bg-muted shadow">
                  <img src={pageImage} alt="Pré-visualização da página do nível" className="h-full w-full object-fill" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Páginas salvas por nível</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[220px_auto_auto] md:items-end">
              <div>
                <Label>Escolha o nível para visualizar</Label>
                <Select value={viewLevel} onValueChange={(value) => { setViewLevel(value); setSelectedId(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>Nível {n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" disabled={!selected} onClick={() => selected && startEdit(selected)}>
                <Edit className="h-4 w-4 mr-2" /> Editar selecionada
              </Button>
              <Button variant="outline" disabled={!selected || deletePage.isPending} onClick={confirmDeleteSelected}>
                <Trash2 className="h-4 w-4 mr-2 text-destructive" /> {deletePage.isPending ? "Excluindo..." : "Excluir selecionada"}
              </Button>
            </div>

            {pagesQuery.isError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                Erro ao carregar páginas: {(pagesQuery.error as any)?.message ?? "erro desconhecido"}
              </div>
            )}

            <div className="overflow-x-auto rounded-md border bg-muted/20 p-3">
              <div className="flex gap-3 pb-1">
                {visiblePages.map((page) => {
                  const active = page.id === selected?.id;
                  return (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => setSelectedId(page.id)}
                      onDoubleClick={() => startEdit(page)}
                      className={`w-32 shrink-0 rounded-md border p-2 text-left transition ${active ? "border-secondary ring-2 ring-secondary" : "border-border hover:border-primary"}`}
                      title="Clique para selecionar. Duplo clique para editar."
                    >
                      <div className="aspect-[1055/1491] overflow-hidden rounded bg-muted">
                        <img src={page.page_data_url} alt={page.name} className="h-full w-full object-fill" />
                      </div>
                      <div className="mt-2 line-clamp-2 text-xs font-medium text-primary">{page.name}</div>
                    </button>
                  );
                })}
                {visiblePages.length === 0 && !pagesQuery.isLoading && (
                  <div className="py-6 text-sm text-muted-foreground">Nenhuma página cadastrada para o nível {viewLevel}.</div>
                )}
                {pagesQuery.isLoading && <div className="py-6 text-sm text-muted-foreground">Carregando páginas...</div>}
              </div>
            </div>

            {selected && (
              <div>
                <div className="mb-2 text-sm font-semibold text-primary">Prévia selecionada — Nível {selected.level}: {selected.name}</div>
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

