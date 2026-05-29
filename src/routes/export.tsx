import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { exportDocxInterleaved, exportPdfInterleaved } from "@/lib/exportersInterleaved";
import { FileText, FileDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/export")({
  head: () => ({ meta: [{ title: "Exportar — Questão de Sucesso" }] }),
  component: ExportPage,
});

type NotebookModel = {
  id: string;
  name: string;
  question_bg_data_url: string;
  answer_bg_data_url: string;
  created_at?: string;
};

type LevelPage = {
  id: string;
  level: number;
  name: string;
  page_data_url: string;
  created_at?: string;
};

function ExportPage() {
  const [title, setTitle] = useState("Caderno de Questões");
  const [notebookId, setNotebookId] = useState<string>("none");
  const [themeId, setThemeId] = useState<string>("all");
  const [subthemeId, setSubthemeId] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [busy, setBusy] = useState<null | "docx" | "pdf">(null);

  const themes = useQuery({
    queryKey: ["themes-list-export"],
    queryFn: async () => (await supabase.from("themes").select("id, name, subthemes(id, name)").order("name")).data ?? [],
  });

  const notebooks = useQuery({
    queryKey: ["notebook-models-export"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notebook_models")
        .select("id, name, question_bg_data_url, answer_bg_data_url, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotebookModel[];
    },
  });

  const levelPages = useQuery({
    queryKey: ["level-pages-export"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("level_pages")
        .select("id, level, name, page_data_url, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LevelPage[];
    },
  });

  const selectedNotebook = useMemo(
    () => notebooks.data?.find((item) => item.id === notebookId) ?? null,
    [notebooks.data, notebookId]
  );

  const selectedTheme = useMemo(
    () => themes.data?.find((t: any) => t.id === themeId),
    [themes.data, themeId]
  );

  const latestLevelPages = useMemo(() => {
    const map: Record<number, LevelPage | undefined> = {};
    for (const page of levelPages.data ?? []) {
      if (!map[page.level]) map[page.level] = page;
    }
    return map;
  }, [levelPages.data]);

  const availableSubthemes = useMemo(() => {
    if (themeId === "all") {
      return themes.data?.flatMap((t: any) => (t.subthemes ?? []).map((s: any) => ({ ...s, themeName: t.name }))) ?? [];
    }
    return selectedTheme?.subthemes ?? [];
  }, [themes.data, selectedTheme?.subthemes, themeId]);

  const questions = useQuery({
    queryKey: ["export-questions", themeId, subthemeId, level],
    queryFn: async () => {
      let q = supabase
        .from("questions")
        .select("*, themes(name), subthemes(name)")
        .order("level")
        .order("number", { nullsFirst: false })
        .order("created_at");
      if (themeId !== "all") q = q.eq("theme_id", themeId);
      if (subthemeId !== "all") q = q.eq("subtheme_id", subthemeId);
      if (level !== "all") q = q.eq("level", Number(level));
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const byLevel = useMemo(() => {
    const counts = [1, 2, 3, 4].map((lv) => ({ lv, n: questions.data?.filter((x: any) => x.level === lv).length ?? 0 }));
    return counts;
  }, [questions.data]);

  function handleThemeChange(value: string) {
    setThemeId(value);
    setSubthemeId("all");
  }

  async function handle(format: "docx" | "pdf") {
    if (!questions.data || questions.data.length === 0) {
      toast.error("Nenhuma questão para exportar com os filtros atuais.");
      return;
    }
    setBusy(format);
    try {
      const opts = {
        title: title.trim() || "Caderno de Questões",
        questions: questions.data as any,
        includeAnswers,
        questionBackgroundDataUrl: selectedNotebook?.question_bg_data_url,
        answerBackgroundDataUrl: selectedNotebook?.answer_bg_data_url,
        levelPageDataUrls: {
          1: latestLevelPages[1]?.page_data_url,
          2: latestLevelPages[2]?.page_data_url,
          3: latestLevelPages[3]?.page_data_url,
          4: latestLevelPages[4]?.page_data_url,
        },
      };
      if (format === "docx") await exportDocxInterleaved(opts);
      else await exportPdfInterleaved(opts);
      toast.success(`Arquivo(s) ${format.toUpperCase()} gerado(s) por nível!`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Exportar ebook</h1>
          <p className="text-muted-foreground">Gere arquivos DOCX ou PDF separados por nível, com a lógica questão → gabarito comentado.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_420px] lg:items-start">
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Configuração</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Par de imagens para exportação</Label>
                  <Select value={notebookId} onValueChange={setNotebookId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Usar fundo padrão</SelectItem>
                      {notebooks.data?.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedNotebook ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      As imagens do caderno "{selectedNotebook.name}" serão usadas nas páginas de questão e gabarito exportadas.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Nenhum par selecionado. A exportação usará os fundos padrão do sistema.
                    </p>
                  )}
                </div>

                <div>
                  <Label>Título base dos arquivos</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tema</Label>
                    <Select value={themeId} onValueChange={handleThemeChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os temas</SelectItem>
                        {themes.data?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Subtema</Label>
                    <Select value={subthemeId} onValueChange={setSubthemeId} disabled={availableSubthemes.length === 0}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os subtemas</SelectItem>
                        {availableSubthemes.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {themeId === "all" && s.themeName ? `${s.themeName} › ${s.name}` : s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Nível</Label>
                    <Select value={level} onValueChange={setLevel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os níveis</SelectItem>
                        {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>Nível {n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={includeAnswers} onCheckedChange={(v) => setIncludeAnswers(Boolean(v))} />
                  <span className="text-sm">Incluir gabarito comentado após cada questão</span>
                </label>
              </CardContent>
            </Card>

            <Card className="bg-muted/40">
              <CardContent className="py-4">
                <p className="text-sm font-medium">{questions.data?.length ?? 0} questões selecionadas</p>
                <div className="text-xs text-muted-foreground mt-1 flex gap-4">
                  {byLevel.map((b) => <span key={b.lv}>Nível {b.lv}: <strong>{b.n}</strong></span>)}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Será gerado um arquivo separado para cada nível que possuir questões selecionadas.
                </p>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button onClick={() => handle("docx")} disabled={busy !== null} className="bg-primary hover:bg-primary/90 flex-1">
                <FileText className="h-4 w-4 mr-2" /> {busy === "docx" ? "Gerando..." : "Exportar DOCX por nível"}
              </Button>
              <Button onClick={() => handle("pdf")} disabled={busy !== null} variant="outline" className="border-primary text-primary flex-1">
                <FileDown className="h-4 w-4 mr-2" /> {busy === "pdf" ? "Gerando..." : "Exportar PDF por nível"}
              </Button>
            </div>
          </div>

          <Card className="lg:sticky lg:top-6">
            <CardHeader><CardTitle>Conferência da exportação</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="mb-2 text-sm font-semibold text-primary">Par de imagens</div>
                {selectedNotebook ? (
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-primary">{selectedNotebook.name}</div>
                    <div className="grid grid-cols-2 gap-3">
                      <NotebookPreview title="Questão" image={selectedNotebook.question_bg_data_url} />
                      <NotebookPreview title="Gabarito" image={selectedNotebook.answer_bg_data_url} />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Fundo padrão do sistema será usado para questão e gabarito.
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-primary">Páginas de abertura por nível</div>
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((lv) => (
                    <LevelPagePreview key={lv} level={lv} image={latestLevelPages[lv]?.page_data_url} name={latestLevelPages[lv]?.name} count={byLevel.find((b) => b.lv === lv)?.n ?? 0} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function NotebookPreview({ title, image }: { title: string; image: string }) {
  return (
    <div>
      <div className="mb-2 text-center text-xs font-semibold text-primary">{title}</div>
      <div className="aspect-[1055/1491] overflow-hidden rounded-lg border bg-muted shadow-sm">
        <img src={image} alt={`Fundo - ${title}`} className="h-full w-full object-fill" />
      </div>
    </div>
  );
}

function LevelPagePreview({ level, image, name, count }: { level: number; image?: string; name?: string; count: number }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="mb-2 text-center text-xs font-semibold text-primary">Nível {level}</div>
      {image ? (
        <div className="space-y-1">
          <div className="aspect-[1055/1491] overflow-hidden rounded border bg-muted">
            <img src={image} alt={`Página nível ${level}`} className="h-full w-full object-fill" />
          </div>
          <div className="line-clamp-1 text-[10px] text-muted-foreground">{name}</div>
        </div>
      ) : (
        <div className="flex aspect-[1055/1491] items-center justify-center rounded border bg-background p-2 text-center text-[10px] text-muted-foreground">
          Sem página cadastrada
        </div>
      )}
      <div className="mt-1 text-center text-[10px] text-muted-foreground">{count} questão(ões)</div>
    </div>
  );
}
