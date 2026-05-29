import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/notebooks")({
  head: () => ({ meta: [{ title: "Cadernos — Questão de Sucesso" }] }),
  component: NotebooksPage,
});

type NotebookModel = {
  id: string;
  name: string;
  question_bg_data_url: string;
  answer_bg_data_url: string;
  created_at?: string;
};

const NOTEBOOKS_QUERY_KEY = ["notebook-models"] as const;

function NotebooksPage() {
  const qc = useQueryClient();
  const questionInputRef = useRef<HTMLInputElement | null>(null);
  const answerInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [questionBg, setQuestionBg] = useState<string | null>(null);
  const [answerBg, setAnswerBg] = useState<string | null>(null);
  const [questionFileName, setQuestionFileName] = useState("");
  const [answerFileName, setAnswerFileName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const notebooksQuery = useQuery({
    queryKey: NOTEBOOKS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notebook_models")
        .select("id, name, question_bg_data_url, answer_bg_data_url, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotebookModel[];
    },
  });

  const notebooks = notebooksQuery.data ?? [];
  const selected = notebooks.find((item) => item.id === selectedId) ?? null;

  const saveNotebook = useMutation({
    mutationFn: async () => {
      if (!questionBg) throw new Error("Envie a imagem de fundo da página de questão.");
      if (!answerBg) throw new Error("Envie a imagem de fundo da página de gabarito.");
      const notebookName = name.trim() || "Modelo de caderno";
      const { data, error } = await (supabase as any)
        .from("notebook_models")
        .insert({
          name: notebookName,
          question_bg_data_url: questionBg,
          answer_bg_data_url: answerBg,
        })
        .select("id, name, question_bg_data_url, answer_bg_data_url, created_at")
        .single();
      if (error) throw error;
      return data as NotebookModel;
    },
    onSuccess: async (saved) => {
      qc.setQueryData<NotebookModel[]>(NOTEBOOKS_QUERY_KEY, (current = []) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedId(saved.id);
      clearForm();
      await qc.invalidateQueries({ queryKey: NOTEBOOKS_QUERY_KEY });
      toast.success("Caderno salvo");
    },
    onError: (e: any) => toast.error(`Erro ao salvar caderno: ${e.message}`),
  });

  const deleteNotebook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("notebook_models").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, deletedId) => {
      qc.setQueryData<NotebookModel[]>(NOTEBOOKS_QUERY_KEY, (current = []) => current.filter((item) => item.id !== deletedId));
      setSelectedId(null);
      await qc.invalidateQueries({ queryKey: NOTEBOOKS_QUERY_KEY });
      toast.success("Caderno excluído");
    },
    onError: (e: any) => toast.error(`Erro ao excluir caderno: ${e.message}`),
  });

  function clearForm() {
    setName("");
    setQuestionBg(null);
    setAnswerBg(null);
    setQuestionFileName("");
    setAnswerFileName("");
  }

  async function handleQuestionUpload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem.");
      return;
    }
    try {
      setQuestionBg(await fileToCompressedDataUrl(file));
      setQuestionFileName(file.name);
      toast.success("Fundo da questão carregado");
    } catch (e: any) {
      toast.error(e.message || "Não foi possível carregar a imagem.");
    }
  }

  async function handleAnswerUpload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem.");
      return;
    }
    try {
      setAnswerBg(await fileToCompressedDataUrl(file));
      setAnswerFileName(file.name);
      toast.success("Fundo do gabarito carregado");
    } catch (e: any) {
      toast.error(e.message || "Não foi possível carregar a imagem.");
    }
  }

  function confirmDeleteSelected() {
    if (!selected) return;
    if (!confirm(`Excluir o caderno "${selected.name}"? Essa ação não pode ser desfeita.`)) return;
    deleteNotebook.mutate(selected.id);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Cadernos</h1>
          <p className="text-muted-foreground">
            Cadastre pares de imagens de fundo para substituir o plano de fundo das páginas de questão e gabarito.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Novo caderno</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome do caderno</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lei 8.112 - Azul e amarelo" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <UploadBox
                title="Fundo da página de questão"
                image={questionBg}
                fileName={questionFileName}
                inputRef={questionInputRef}
                onUpload={handleQuestionUpload}
                onClear={() => { setQuestionBg(null); setQuestionFileName(""); }}
              />
              <UploadBox
                title="Fundo da página de gabarito"
                image={answerBg}
                fileName={answerFileName}
                inputRef={answerInputRef}
                onUpload={handleAnswerUpload}
                onClear={() => { setAnswerBg(null); setAnswerFileName(""); }}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={() => saveNotebook.mutate()} disabled={!questionBg || !answerBg || saveNotebook.isPending}>
                <Save className="h-4 w-4 mr-2" /> {saveNotebook.isPending ? "Salvando..." : "Salvar caderno"}
              </Button>
              <Button variant="outline" onClick={clearForm} disabled={!questionBg && !answerBg && !name}>Limpar</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cadernos salvos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {notebooksQuery.isError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                Erro ao carregar cadernos: {(notebooksQuery.error as any)?.message ?? "erro desconhecido"}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
              <div className="max-h-[30vh] overflow-x-auto rounded-md border bg-muted/20 p-2">
                <div className="flex gap-3">
                  {notebooks.map((item) => {
                    const active = item.id === selected?.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={`w-44 shrink-0 rounded-md border p-2 text-left transition ${active ? "border-secondary ring-2 ring-secondary" : "border-border hover:border-primary"}`}
                      >
                        <div className="grid grid-cols-2 gap-1">
                          <div className="aspect-[1055/1491] overflow-hidden rounded bg-muted">
                            <img src={item.question_bg_data_url} alt={`${item.name} - questão`} className="h-full w-full object-fill" />
                          </div>
                          <div className="aspect-[1055/1491] overflow-hidden rounded bg-muted">
                            <img src={item.answer_bg_data_url} alt={`${item.name} - gabarito`} className="h-full w-full object-fill" />
                          </div>
                        </div>
                        <div className="mt-2 line-clamp-2 text-xs font-medium text-primary">{item.name}</div>
                      </button>
                    );
                  })}
                  {notebooks.length === 0 && !notebooksQuery.isLoading && (
                    <div className="py-6 text-sm text-muted-foreground">Nenhum caderno salvo.</div>
                  )}
                  {notebooksQuery.isLoading && <div className="py-6 text-sm text-muted-foreground">Carregando cadernos...</div>}
                </div>
              </div>

              <Button variant="outline" disabled={!selected || deleteNotebook.isPending} onClick={confirmDeleteSelected}>
                <Trash2 className="h-4 w-4 mr-2 text-destructive" /> {deleteNotebook.isPending ? "Excluindo..." : "Excluir caderno"}
              </Button>
            </div>

            {selected && (
              <div className="grid gap-4 md:grid-cols-2">
                <Preview title="Questão" image={selected.question_bg_data_url} />
                <Preview title="Gabarito" image={selected.answer_bg_data_url} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function UploadBox({ title, image, fileName, inputRef, onUpload, onClear }: {
  title: string;
  image: string | null;
  fileName: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (file: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label>{title}</Label>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => onUpload(event.target.files?.[0])} />
      {image ? (
        <div className="space-y-2">
          <div className="mx-auto aspect-[1055/1491] max-h-72 overflow-hidden rounded border bg-muted">
            <img src={image} alt={title} className="h-full w-full object-fill" />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">{fileName}</span>
            <Button size="sm" variant="ghost" onClick={onClear}><X className="h-4 w-4 mr-1" />Remover</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
          <UploadCloud className="h-4 w-4 mr-2" /> Escolher imagem
        </Button>
      )}
    </div>
  );
}

function Preview({ title, image }: { title: string; image: string }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-primary">Prévia - {title}</div>
      <div className="mx-auto aspect-[1055/1491] max-h-[55vh] overflow-hidden rounded-xl border bg-muted shadow">
        <img src={image} alt={title} className="h-full w-full object-fill" />
      </div>
    </div>
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
