import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertTriangle, BookOpen, Layers, ListChecks, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Temas — Questão de Sucesso" }] }),
  component: ThemesPage,
});

type ThemeRow = { id: string; name: string; description?: string | null; subthemes?: SubthemeRow[] };
type SubthemeRow = { id: string; theme_id: string; name: string; programmatic_contents?: ContentRow[] };
type ContentRow = { id: string; subtheme_id: string; name: string; description?: string | null };
type SimilarItem = { kind: "Tema" | "Subtema" | "Conteúdo"; id: string; name: string; parent?: string; description?: string | null; score: number };

function normalize(value: string) {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function similarity(a: string, b: string) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.86;
  const aw = new Set(na.split(" ").filter((w) => w.length > 2));
  const bw = new Set(nb.split(" ").filter((w) => w.length > 2));
  const inter = [...aw].filter((w) => bw.has(w)).length;
  const union = new Set([...aw, ...bw]).size || 1;
  return inter / union;
}
function isSimilar(a: string, b: string) { return similarity(a, b) >= 0.55; }

function ThemesPage() {
  const qc = useQueryClient();
  const [themeName, setThemeName] = useState("");
  const [themeDesc, setThemeDesc] = useState("");
  const [subthemeName, setSubthemeName] = useState("");
  const [subthemeThemeId, setSubthemeThemeId] = useState("");
  const [contentName, setContentName] = useState("");
  const [contentDesc, setContentDesc] = useState("");
  const [contentSubthemeId, setContentSubthemeId] = useState("");
  const [search, setSearch] = useState("");
  const [themeFilter, setThemeFilter] = useState("all");
  const [subthemeFilter, setSubthemeFilter] = useState("all");

  const themes = useQuery({
    queryKey: ["themes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("themes")
        .select("id, name, description, subthemes(id, theme_id, name, programmatic_contents(id, subtheme_id, name, description))")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ThemeRow[];
    },
  });

  const questions = useQuery({
    queryKey: ["questions-counts-taxonomy"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("questions")
        .select("id, theme_id, subtheme_id, question_programmatic_contents(content_id)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const allThemes = themes.data ?? [];
  const allSubthemes = useMemo(() => allThemes.flatMap((t) => (t.subthemes ?? []).map((s) => ({ ...s, themeName: t.name }))), [allThemes]);
  const allContents = useMemo(() => allSubthemes.flatMap((s: any) => (s.programmatic_contents ?? []).map((c: any) => ({ ...c, subthemeName: s.name, themeName: s.themeName }))), [allSubthemes]);

  const counts = useMemo(() => {
    const theme = new Map<string, number>();
    const subtheme = new Map<string, number>();
    const content = new Map<string, number>();
    (questions.data ?? []).forEach((q: any) => {
      if (q.theme_id) theme.set(q.theme_id, (theme.get(q.theme_id) ?? 0) + 1);
      if (q.subtheme_id) subtheme.set(q.subtheme_id, (subtheme.get(q.subtheme_id) ?? 0) + 1);
      (q.question_programmatic_contents ?? []).forEach((rel: any) => content.set(rel.content_id, (content.get(rel.content_id) ?? 0) + 1));
    });
    return { theme, subtheme, content };
  }, [questions.data]);

  const similarItems = useMemo(() => {
    const items: SimilarItem[] = [];
    for (let i = 0; i < allThemes.length; i++) for (let j = i + 1; j < allThemes.length; j++) {
      const score = similarity(allThemes[i].name, allThemes[j].name);
      if (score >= 0.55) items.push({ kind: "Tema", id: `${allThemes[i].id}-${allThemes[j].id}`, name: `${allThemes[i].name} ↔ ${allThemes[j].name}`, description: `${allThemes[i].description ?? ""} | ${allThemes[j].description ?? ""}`, score });
    }
    for (let i = 0; i < allSubthemes.length; i++) for (let j = i + 1; j < allSubthemes.length; j++) {
      const score = similarity(allSubthemes[i].name, allSubthemes[j].name);
      if (score >= 0.55) items.push({ kind: "Subtema", id: `${allSubthemes[i].id}-${allSubthemes[j].id}`, name: `${allSubthemes[i].name} ↔ ${allSubthemes[j].name}`, parent: `${allSubthemes[i].themeName} | ${allSubthemes[j].themeName}`, score });
    }
    for (let i = 0; i < allContents.length; i++) for (let j = i + 1; j < allContents.length; j++) {
      const score = similarity(allContents[i].name, allContents[j].name);
      if (score >= 0.55) items.push({ kind: "Conteúdo", id: `${allContents[i].id}-${allContents[j].id}`, name: `${allContents[i].name} ↔ ${allContents[j].name}`, parent: `${allContents[i].themeName} › ${allContents[i].subthemeName} | ${allContents[j].themeName} › ${allContents[j].subthemeName}`, score });
    }
    return items.sort((a, b) => b.score - a.score).slice(0, 20);
  }, [allThemes, allSubthemes, allContents]);

  const filteredThemes = useMemo(() => {
    const needle = normalize(search);
    return allThemes.filter((theme) => {
      if (themeFilter !== "all" && theme.id !== themeFilter) return false;
      const subthemes = theme.subthemes ?? [];
      if (subthemeFilter !== "all" && !subthemes.some((s) => s.id === subthemeFilter)) return false;
      if (!needle) return true;
      const haystack = normalize([theme.name, theme.description, ...subthemes.flatMap((s) => [s.name, ...(s.programmatic_contents ?? []).flatMap((c) => [c.name, c.description])])].filter(Boolean).join(" "));
      return haystack.includes(needle);
    });
  }, [allThemes, search, themeFilter, subthemeFilter]);

  const addTheme = useMutation({
    mutationFn: async () => {
      const similar = allThemes.find((t) => isSimilar(t.name, themeName));
      if (similar) {
        const replace = !confirm(`Já existe tema similar.\n\nExistente: ${similar.name}\nDescrição: ${similar.description ?? "—"}\n\nNovo: ${themeName}\nDescrição: ${themeDesc || "—"}\n\nOK = cadastrar novo\nCancelar = substituir o existente`);
        if (replace) {
          const { error } = await supabase.from("themes").update({ name: themeName, description: themeDesc || null }).eq("id", similar.id);
          if (error) throw error;
          return;
        }
      }
      const { error } = await supabase.from("themes").insert({ name: themeName, description: themeDesc || null });
      if (error) throw error;
    },
    onSuccess: () => { setThemeName(""); setThemeDesc(""); qc.invalidateQueries({ queryKey: ["themes"] }); toast.success("Tema salvo"); },
    onError: (e: any) => toast.error(e.message),
  });

  const addSubtheme = useMutation({
    mutationFn: async () => {
      const similar = allSubthemes.find((s: any) => s.theme_id === subthemeThemeId && isSimilar(s.name, subthemeName));
      if (similar) {
        const replace = !confirm(`Já existe subtema similar no mesmo tema.\n\nExistente: ${similar.name}\nTema: ${similar.themeName}\n\nNovo: ${subthemeName}\n\nOK = cadastrar novo\nCancelar = substituir o existente`);
        if (replace) {
          const { error } = await supabase.from("subthemes").update({ name: subthemeName }).eq("id", similar.id);
          if (error) throw error;
          return;
        }
      }
      const { error } = await supabase.from("subthemes").insert({ theme_id: subthemeThemeId, name: subthemeName });
      if (error) throw error;
    },
    onSuccess: () => { setSubthemeName(""); qc.invalidateQueries({ queryKey: ["themes"] }); toast.success("Subtema salvo"); },
    onError: (e: any) => toast.error(e.message),
  });

  const addContent = useMutation({
    mutationFn: async () => {
      const similar = allContents.find((c: any) => c.subtheme_id === contentSubthemeId && isSimilar(c.name, contentName));
      if (similar) {
        const replace = !confirm(`Já existe conteúdo programático similar no mesmo subtema.\n\nExistente: ${similar.name}\nDescrição: ${similar.description ?? "—"}\n\nNovo: ${contentName}\nDescrição: ${contentDesc || "—"}\n\nOK = cadastrar novo\nCancelar = substituir o existente`);
        if (replace) {
          const { error } = await (supabase as any).from("programmatic_contents").update({ name: contentName, description: contentDesc || null }).eq("id", similar.id);
          if (error) throw error;
          return;
        }
      }
      const { error } = await (supabase as any).from("programmatic_contents").insert({ subtheme_id: contentSubthemeId, name: contentName, description: contentDesc || null });
      if (error) throw error;
    },
    onSuccess: () => { setContentName(""); setContentDesc(""); qc.invalidateQueries({ queryKey: ["themes"] }); toast.success("Conteúdo programático salvo"); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["themes"] }); qc.invalidateQueries({ queryKey: ["questions-counts-taxonomy"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Temas</h1>
          <p className="text-muted-foreground">Organize tema, subtema e conteúdo programático em estrutura hierárquica.</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card><CardHeader><CardTitle>Novo tema</CardTitle></CardHeader><CardContent className="space-y-3"><Input placeholder="Tema" value={themeName} onChange={(e) => setThemeName(e.target.value)} /><Textarea placeholder="Descrição" value={themeDesc} onChange={(e) => setThemeDesc(e.target.value)} /><Button disabled={!themeName.trim()} onClick={() => addTheme.mutate()} className="w-full"><Plus className="h-4 w-4 mr-2" />Salvar tema</Button></CardContent></Card>
          <Card><CardHeader><CardTitle>Novo subtema</CardTitle></CardHeader><CardContent className="space-y-3"><Select value={subthemeThemeId} onValueChange={setSubthemeThemeId}><SelectTrigger><SelectValue placeholder="Tema vinculado" /></SelectTrigger><SelectContent>{allThemes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select><Input placeholder="Subtema" value={subthemeName} onChange={(e) => setSubthemeName(e.target.value)} /><Button disabled={!subthemeThemeId || !subthemeName.trim()} onClick={() => addSubtheme.mutate()} className="w-full"><Plus className="h-4 w-4 mr-2" />Salvar subtema</Button></CardContent></Card>
          <Card><CardHeader><CardTitle>Novo conteúdo programático</CardTitle></CardHeader><CardContent className="space-y-3"><Select value={contentSubthemeId} onValueChange={setContentSubthemeId}><SelectTrigger><SelectValue placeholder="Subtema vinculado" /></SelectTrigger><SelectContent>{allSubthemes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.themeName} › {s.name}</SelectItem>)}</SelectContent></Select><Input placeholder="Conteúdo programático" value={contentName} onChange={(e) => setContentName(e.target.value)} /><Textarea placeholder="Descrição" value={contentDesc} onChange={(e) => setContentDesc(e.target.value)} /><Button disabled={!contentSubthemeId || !contentName.trim()} onClick={() => addContent.mutate()} className="w-full"><Plus className="h-4 w-4 mr-2" />Salvar conteúdo</Button></CardContent></Card>
        </div>

        <Card><CardHeader><CardTitle>Filtros e pesquisa</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-[1fr_1fr_2fr_auto] lg:items-end"><div><Label>Tema</Label><Select value={themeFilter} onValueChange={(v) => { setThemeFilter(v); setSubthemeFilter("all"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{allThemes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Subtema</Label><Select value={subthemeFilter} onValueChange={setSubthemeFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{allSubthemes.filter((s: any) => themeFilter === "all" || s.theme_id === themeFilter).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.themeName} › {s.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Pesquisa livre</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9 pr-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tema, subtema, conteúdo ou descrição" />{search && <button className="absolute right-2 top-2 rounded p-1 hover:bg-muted" onClick={() => setSearch("")}><X className="h-4 w-4" /></button>}</div></div><Button variant="outline" onClick={() => { setSearch(""); setThemeFilter("all"); setSubthemeFilter("all"); }}>Limpar</Button></CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Análise de similaridade</CardTitle></CardHeader><CardContent>{similarItems.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item similar relevante encontrado.</p> : <div className="grid gap-2 md:grid-cols-2">{similarItems.map((item) => <div key={item.id} className="rounded-md border bg-background/70 p-3 text-sm"><div className="flex items-center justify-between"><Badge>{item.kind}</Badge><span className="text-xs text-muted-foreground">Similaridade: {Math.round(item.score * 100)}%</span></div><div className="mt-2 font-semibold text-primary">{item.name}</div>{item.parent && <div className="text-xs text-muted-foreground">{item.parent}</div>}<p className="mt-2 text-xs text-muted-foreground">Decisão sugerida: editar um dos itens, manter ambos se representarem escopos distintos, ou alterar a nomenclatura para diferenciar.</p></div>)}</div>}</CardContent></Card>

        <div className="flex items-center justify-between"><h2 className="text-2xl font-bold text-primary">Estrutura cadastrada</h2><span className="text-sm text-muted-foreground">{filteredThemes.length} tema(s)</span></div>
        <div className="space-y-4">
          {filteredThemes.map((theme) => (
            <Card key={theme.id} className="border-l-4 border-l-secondary"><CardContent className="py-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /><h3 className="text-xl font-bold text-primary">{theme.name}</h3><Badge>{counts.theme.get(theme.id) ?? 0} questões</Badge></div>{theme.description && <p className="mt-1 text-sm text-muted-foreground">{theme.description}</p>}<div className="mt-2 flex gap-3 text-xs text-muted-foreground"><span>{theme.subthemes?.length ?? 0} subtemas</span><span>{(theme.subthemes ?? []).reduce((n, s) => n + (s.programmatic_contents?.length ?? 0), 0)} conteúdos</span></div></div><div className="flex gap-2"><Link to="/questions" search={{ themeId: theme.id } as any}><Button size="sm" variant="outline">Questões</Button></Link><Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir tema e toda a estrutura vinculada?")) del.mutate({ table: "themes", id: theme.id }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>
              <div className="mt-4 space-y-3">{(theme.subthemes ?? []).map((sub) => <div key={sub.id} className="rounded-lg border bg-background/70 p-3"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /><span className="font-semibold text-primary">{sub.name}</span><Badge variant="outline">{counts.subtheme.get(sub.id) ?? 0} questões</Badge></div><Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir subtema e conteúdos vinculados?")) del.mutate({ table: "subthemes", id: sub.id }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div><div className="mt-2 grid gap-2 md:grid-cols-2">{(sub.programmatic_contents ?? []).map((content) => <div key={content.id} className="rounded-md border bg-muted/30 p-2"><div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /><span className="text-sm font-medium">{content.name}</span><Badge variant="outline">{counts.content.get(content.id) ?? 0}</Badge></div>{content.description && <p className="mt-1 text-xs text-muted-foreground">{content.description}</p>}</div><Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir conteúdo programático?")) del.mutate({ table: "programmatic_contents", id: content.id }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>)}{(sub.programmatic_contents ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhum conteúdo programático.</p>}</div></div>)}</div>
            </CardContent></Card>
          ))}
          {!themes.isLoading && filteredThemes.length === 0 && <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum resultado encontrado.</CardContent></Card>}
        </div>
      </div>
    </AppShell>
  );
}
