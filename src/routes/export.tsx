import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { exportDocxInterleaved, exportPdfInterleaved } from "@/lib/exportersInterleaved";
import { FileText, FileDown, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/export")({
  head: () => ({ meta: [{ title: "Exportar — Questão de Sucesso" }] }),
  component: ExportPage,
});

type NotebookModel = { id: string; name: string; question_bg_data_url: string; answer_bg_data_url: string; created_at?: string };
type LevelPage = { id: string; level: number; name: string; page_data_url: string; created_at?: string };
type AboutPageModel = { id: string; name: string; description: string | null; page_data_url: string; created_at?: string };
type TempCover = { name: string; dataUrl: string; savedAt?: string };

const TEMP_EXPORT_COVER_KEY = "questao-sucesso-export-cover";
const LEVELS = [1, 2, 3, 4] as const;

function ExportPage() {
  const [title, setTitle] = useState("Caderno de Questões");
  const [notebookId, setNotebookId] = useState<string>("none");
  const [themeId, setThemeId] = useState<string>("all");
  const [subthemeId, setSubthemeId] = useState<string>("all");
  const [selectedLevels, setSelectedLevels] = useState<number[]>([1, 2, 3, 4]);
  const [selectedAboutPageIds, setSelectedAboutPageIds] = useState<string[]>([]);
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [busy, setBusy] = useState<null | "docx" | "pdf">(null);
  const [tempCover, setTempCover] = useState<TempCover | null>(null);
  const [levelPageSelections, setLevelPageSelections] = useState<Record<number, string>>({ 1: "auto", 2: "auto", 3: "auto", 4: "auto" });

  useEffect(() => {
    function readCover() {
      try {
        const raw = localStorage.getItem(TEMP_EXPORT_COVER_KEY);
        setTempCover(raw ? JSON.parse(raw) as TempCover : null);
      } catch {
        setTempCover(null);
      }
    }
    readCover();
    window.addEventListener("storage", readCover);
    window.addEventListener("focus", readCover);
    return () => {
      window.removeEventListener("storage", readCover);
      window.removeEventListener("focus", readCover);
    };
  }, []);

  const themes = useQuery({
    queryKey: ["themes-list-export"],
    queryFn: async () => (await supabase.from("themes").select("id, name, subthemes(id, name)").order("name")).data ?? [],
  });

  const notebooks = useQuery({
    queryKey: ["notebook-models-export"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("notebook_models").select("id, name, question_bg_data_url, answer_bg_data_url, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotebookModel[];
    },
  });

  const levelPages = useQuery({
    queryKey: ["level-pages-export"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("level_pages").select("id, level, name, page_data_url, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LevelPage[];
    },
  });

  const aboutPages = useQuery({
    queryKey: ["about-pages-export"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("about_pages").select("id, name, description, page_data_url, created_at").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AboutPageModel[];
    },
  });

  const selectedNotebook = useMemo(() => notebooks.data?.find((item) => item.id === notebookId) ?? null, [notebooks.data, notebookId]);
  const selectedTheme = useMemo(() => themes.data?.find((t: any) => t.id === themeId), [themes.data, themeId]);

  const levelPagesByLevel = useMemo(() => {
    const map: Record<number, LevelPage[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const page of levelPages.data ?? []) map[page.level]?.push(page);
    return map;
  }, [levelPages.data]);

  const selectedLevelPages = useMemo(() => {
    const map: Record<number, LevelPage | undefined> = {};
    LEVELS.forEach((lv) => {
      const selection = levelPageSelections[lv] ?? "auto";
      if (selection === "none") return;
      if (selection === "auto") map[lv] = levelPagesByLevel[lv]?.[0];
      else map[lv] = levelPagesByLevel[lv]?.find((page) => page.id === selection);
    });
    return map;
  }, [levelPageSelections, levelPagesByLevel]);

  const selectedAboutPages = useMemo(() => {
    const idSet = new Set(selectedAboutPageIds);
    return (aboutPages.data ?? []).filter((page) => idSet.has(page.id));
  }, [aboutPages.data, selectedAboutPageIds]);

  const availableSubthemes = useMemo(() => {
    if (themeId === "all") return themes.data?.flatMap((t: any) => (t.subthemes ?? []).map((s: any) => ({ ...s, themeName: t.name }))) ?? [];
    return selectedTheme?.subthemes ?? [];
  }, [themes.data, selectedTheme?.subthemes, themeId]);

  const questions = useQuery({
    queryKey: ["export-questions", themeId, subthemeId, selectedLevels.join(",")],
    queryFn: async () => {
      if (selectedLevels.length === 0) return [];
      let q = supabase.from("questions").select("*, themes(name), subthemes(name)").order("level").order("number", { nullsFirst: false }).order("created_at");
      if (themeId !== "all") q = q.eq("theme_id", themeId);
      if (subthemeId !== "all") q = q.eq("subtheme_id", subthemeId);
      q = q.in("level", selectedLevels);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const byLevel = useMemo(() => LEVELS.map((lv) => ({ lv, n: questions.data?.filter((x: any) => x.level === lv).length ?? 0 })), [questions.data]);

  function handleThemeChange(value: string) {
    setThemeId(value);
    setSubthemeId("all");
  }

  function clearTempCover() {
    localStorage.removeItem(TEMP_EXPORT_COVER_KEY);
    setTempCover(null);
    toast.success("Capa temporária removida da exportação");
  }

  function updateLevelPageSelection(levelNumber: number, value: string) {
    setLevelPageSelections((current) => ({ ...current, [levelNumber]: value }));
  }

  function toggleQuestionLevel(levelNumber: number, checked: boolean) {
    setSelectedLevels((current) => {
      const next = checked ? Array.from(new Set([...current, levelNumber])) : current.filter((item) => item !== levelNumber);
      return next.sort((a, b) => a - b);
    });
  }

  function toggleAboutPage(id: string, checked: boolean) {
    setSelectedAboutPageIds((current) => checked ? [...current, id] : current.filter((item) => item !== id));
  }

  async function handle(format: "docx" | "pdf") {
    if (selectedLevels.length === 0) {
      toast.error("Selecione ao menos um nível de questões.");
      return;
    }
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
        coverDataUrl: tempCover?.dataUrl,
        aboutPageDataUrls: selectedAboutPages.map((page) => page.page_data_url),
        questionBackgroundDataUrl: selectedNotebook?.question_bg_data_url,
        answerBackgroundDataUrl: selectedNotebook?.answer_bg_data_url,
        levelPageDataUrls: {
          1: selectedLevelPages[1]?.page_data_url,
          2: selectedLevelPages[2]?.page_data_url,
          3: selectedLevelPages[3]?.page_data_url,
          4: selectedLevelPages[4]?.page_data_url,
        },
      };
      if (format === "docx") await exportDocxInterleaved(opts);
      else await exportPdfInterleaved(opts);
      toast.success(`Arquivo ${format.toUpperCase()} gerado!`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Exportar ebook</h1>
          <p className="text-muted-foreground">Configure capa, páginas Sobre nós, páginas de nível e fundos de questão/gabarito antes de gerar um único arquivo.</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Configuração</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <Label>Par de imagens questão/gabarito</Label>
                <Select value={notebookId} onValueChange={setNotebookId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Usar fundo padrão</SelectItem>
                    {notebooks.data?.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Título base do arquivo</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Páginas Sobre nós</Label>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border bg-muted/20 p-3">
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {(aboutPages.data ?? []).map((page) => (
                    <label key={page.id} className="flex items-start gap-2 rounded-md border bg-background p-2 text-sm cursor-pointer">
                      <Checkbox checked={selectedAboutPageIds.includes(page.id)} onCheckedChange={(v) => toggleAboutPage(page.id, Boolean(v))} />
                      <span>
                        <span className="block font-medium text-primary">{page.name}</span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{page.description || "Sem descrição"}</span>
                      </span>
                    </label>
                  ))}
                  {aboutPages.data?.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma página cadastrada no menu Sobre nós.</div>}
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">As páginas selecionadas entram após a capa e antes da primeira página de nível.</p>
            </div>

            <div>
              <Label>Imagens de abertura dos níveis</Label>
              <div className="mt-2 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {LEVELS.map((lv) => (
                  <div key={lv}>
                    <Label className="text-xs">Nível {lv}</Label>
                    <Select value={levelPageSelections[lv] ?? "auto"} onValueChange={(value) => updateLevelPageSelection(lv, value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Usar mais recente</SelectItem>
                        <SelectItem value="none">Não incluir</SelectItem>
                        {levelPagesByLevel[lv]?.map((page) => <SelectItem key={page.id} value={page.id}>{page.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
                      <SelectItem key={s.id} value={s.id}>{themeId === "all" && s.themeName ? `${s.themeName} › ${s.name}` : s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Níveis das questões</Label>
              <div className="mt-2 flex flex-wrap gap-4 rounded-md border bg-muted/20 p-3">
                {LEVELS.map((lv) => (
                  <label key={lv} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox checked={selectedLevels.includes(lv)} onCheckedChange={(v) => toggleQuestionLevel(lv, Boolean(v))} />
                    <span>Nível {lv}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={includeAnswers} onCheckedChange={(v) => setIncludeAnswers(Boolean(v))} />
              <span className="text-sm">Incluir gabarito comentado após cada questão</span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Conferência da exportação</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border bg-muted/20 p-3">
              <div className="flex min-w-max gap-3">
                <PreviewCard title="Capa" subtitle={tempCover?.name ?? "Nenhuma"} image={tempCover?.dataUrl} emptyText="Sem capa" onClear={tempCover ? clearTempCover : undefined} />
                {selectedAboutPages.map((page) => <PreviewCard key={page.id} title="Sobre nós" subtitle={page.name} image={page.page_data_url} emptyText="Sem página" />)}
                {LEVELS.map((lv) => (
                  <PreviewCard key={lv} title={`Nível ${lv}`} subtitle={`${byLevel.find((b) => b.lv === lv)?.n ?? 0} questão(ões)`} image={selectedLevelPages[lv]?.page_data_url} emptyText="Sem página" muted={!selectedLevels.includes(lv)} />
                ))}
                <PreviewCard title="Questão" subtitle={selectedNotebook?.name ?? "Padrão"} image={selectedNotebook?.question_bg_data_url} emptyText="Fundo padrão" />
                <PreviewCard title="Gabarito" subtitle={selectedNotebook?.name ?? "Padrão"} image={selectedNotebook?.answer_bg_data_url} emptyText="Fundo padrão" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/40">
          <CardContent className="py-4">
            <p className="text-sm font-medium">{questions.data?.length ?? 0} questões selecionadas</p>
            <div className="text-xs text-muted-foreground mt-1 flex gap-4">
              {byLevel.map((b) => <span key={b.lv}>Nível {b.lv}: <strong>{b.n}</strong></span>)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Será gerado um único arquivo contendo capa, Sobre nós, níveis selecionados, questões e gabaritos.</p>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={() => handle("docx")} disabled={busy !== null} className="bg-primary hover:bg-primary/90 flex-1">
            <FileText className="h-4 w-4 mr-2" /> {busy === "docx" ? "Gerando..." : "Exportar DOCX"}
          </Button>
          <Button onClick={() => handle("pdf")} disabled={busy !== null} variant="outline" className="border-primary text-primary flex-1">
            <FileDown className="h-4 w-4 mr-2" /> {busy === "pdf" ? "Gerando..." : "Exportar PDF"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function PreviewCard({ title, subtitle, image, emptyText, onClear, muted = false }: { title: string; subtitle?: string; image?: string; emptyText: string; onClear?: () => void; muted?: boolean }) {
  return (
    <div className={`w-32 shrink-0 rounded-md border bg-background p-2 ${muted ? "opacity-40" : ""}`}>
      <div className="mb-1 flex items-center justify-between gap-1">
        <div className="text-xs font-semibold text-primary">{title}</div>
        {onClear && <button type="button" onClick={onClear} className="rounded p-0.5 hover:bg-muted" title="Remover"><X className="h-3 w-3" /></button>}
      </div>
      <div className="aspect-[1055/1491] overflow-hidden rounded border bg-muted">
        {image ? <img src={image} alt={title} className="h-full w-full object-fill" /> : <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-muted-foreground">{emptyText}</div>}
      </div>
      <div className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{subtitle}</div>
    </div>
  );
}
