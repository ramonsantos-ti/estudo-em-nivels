import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Search, Pencil, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/questions-list")({
  head: () => ({ meta: [{ title: "Listar questões — Questão de Sucesso" }] }),
  component: QuestionsListPage,
});

type Form = {
  theme_id: string;
  subtheme_id: string;
  level: number;
  number: string;
  intro: string;
  command: string;
  alt_a: string; alt_b: string; alt_c: string; alt_d: string; alt_e: string;
  correct: "A" | "B" | "C" | "D" | "E";
  exp_a: string; exp_b: string; exp_c: string; exp_d: string; exp_e: string;
};

function QuestionsListPage() {
  const qc = useQueryClient();
  const [themeId, setThemeId] = useState("all");
  const [subthemeId, setSubthemeId] = useState("all");
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  const themes = useQuery({
    queryKey: ["themes-list-questions-list"],
    queryFn: async () => {
      const { data } = await supabase.from("themes").select("id, name, subthemes(id, name)").order("name");
      return data ?? [];
    },
  });

  const selectedTheme = useMemo(
    () => themes.data?.find((t: any) => t.id === themeId),
    [themes.data, themeId]
  );

  const availableSubthemes = useMemo(() => {
    if (themeId === "all") {
      return themes.data?.flatMap((t: any) => (t.subthemes ?? []).map((s: any) => ({ ...s, themeName: t.name }))) ?? [];
    }
    return selectedTheme?.subthemes ?? [];
  }, [themes.data, selectedTheme?.subthemes, themeId]);

  const questions = useQuery({
    queryKey: ["questions-list", themeId, subthemeId, level, search],
    queryFn: async () => {
      let q = supabase
        .from("questions")
        .select("*, themes(name), subthemes(name)")
        .order("level")
        .order("number", { nullsFirst: false })
        .order("created_at", { ascending: false });

      if (themeId !== "all") q = q.eq("theme_id", themeId);
      if (subthemeId !== "all") q = q.eq("subtheme_id", subthemeId);
      if (level !== "all") q = q.eq("level", Number(level));

      const { data, error } = await q;
      if (error) throw error;

      const needle = normalize(search);
      if (!needle) return data ?? [];

      return (data ?? []).filter((item: any) => {
        const haystack = normalize([
          item.number,
          item.intro,
          item.command,
          item.alt_a,
          item.alt_b,
          item.alt_c,
          item.alt_d,
          item.alt_e,
          item.correct,
          item.exp_a,
          item.exp_b,
          item.exp_c,
          item.exp_d,
          item.exp_e,
          item.themes?.name,
          item.subthemes?.name,
        ].filter(Boolean).join(" "));
        return haystack.includes(needle);
      });
    },
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editingId || !form) return;
      const payload = {
        theme_id: form.theme_id,
        subtheme_id: form.subtheme_id || null,
        level: form.level,
        number: form.number ? parseInt(form.number) : null,
        intro: form.intro || null,
        command: form.command,
        alt_a: form.alt_a,
        alt_b: form.alt_b,
        alt_c: form.alt_c,
        alt_d: form.alt_d,
        alt_e: form.alt_e,
        correct: form.correct,
        exp_a: form.exp_a || null,
        exp_b: form.exp_b || null,
        exp_c: form.exp_c || null,
        exp_d: form.exp_d || null,
        exp_e: form.exp_e || null,
      };
      const { error } = await supabase.from("questions").update(payload).eq("id", editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Questão atualizada");
      setEditingId(null);
      setForm(null);
      qc.invalidateQueries({ queryKey: ["questions-list"] });
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Questão excluída");
      qc.invalidateQueries({ queryKey: ["questions-list"] });
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function handleThemeChange(value: string) {
    setThemeId(value);
    setSubthemeId("all");
  }

  function startEdit(q: any) {
    setEditingId(q.id);
    setForm(rowToForm(q));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(null);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Listar questões</h1>
          <p className="text-muted-foreground">Pesquise, filtre, edite e exclua questões cadastradas.</p>
        </div>

        {editingId && form && (
          <Card className="border-secondary">
            <CardHeader className="bg-secondary text-secondary-foreground">
              <CardTitle className="flex items-center justify-between">
                Editar questão
                <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="h-4 w-4 mr-2" />Cancelar</Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tema</Label>
                  <Select value={form.theme_id} onValueChange={(v) => setForm({ ...form, theme_id: v, subtheme_id: "" })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {themes.data?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Subtema</Label>
                  <Select value={form.subtheme_id} onValueChange={(v) => setForm({ ...form, subtheme_id: v })} disabled={!themes.data?.find((t: any) => t.id === form.theme_id)?.subthemes?.length}>
                    <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                    <SelectContent>
                      {themes.data?.find((t: any) => t.id === form.theme_id)?.subthemes?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nível</Label>
                  <Select value={String(form.level)} onValueChange={(v) => setForm({ ...form, level: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>Nível {n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Número</Label>
                  <Input type="number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
                </div>
              </div>

              <div>
                <Label>Enunciado</Label>
                <Textarea rows={3} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} />
              </div>
              <div>
                <Label>Comando</Label>
                <Textarea rows={2} value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} />
              </div>

              {(["a", "b", "c", "d", "e"] as const).map((l) => (
                <div key={l} className="grid grid-cols-[auto_1fr] gap-2 items-start">
                  <div className="bg-primary text-primary-foreground rounded-md w-9 h-9 flex items-center justify-center font-bold mt-7">{l.toUpperCase()}</div>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">Alternativa {l.toUpperCase()}</Label>
                      <Textarea rows={2} value={form[`alt_${l}` as const]} onChange={(e) => setForm({ ...form, [`alt_${l}`]: e.target.value } as any)} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Comentário {l.toUpperCase()}</Label>
                      <Textarea rows={2} value={form[`exp_${l}` as const]} onChange={(e) => setForm({ ...form, [`exp_${l}`]: e.target.value } as any)} />
                    </div>
                  </div>
                </div>
              ))}

              <div>
                <Label>Gabarito</Label>
                <Select value={form.correct} onValueChange={(v) => setForm({ ...form, correct: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["A", "B", "C", "D", "E"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => update.mutate()} disabled={update.isPending} className="bg-primary hover:bg-primary/90 flex-1">Salvar alterações</Button>
                <Button variant="outline" onClick={cancelEdit}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Filtros</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
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
              <div>
                <Label>Pesquisa livre</Label>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Texto, alternativa, comentário..." />
                </div>
              </div>
            </div>
            <Button variant="outline" onClick={() => { setThemeId("all"); setSubthemeId("all"); setLevel("all"); setSearch(""); }}>
              Limpar filtros
            </Button>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-primary">Questões cadastradas</h2>
          <span className="text-sm text-muted-foreground">{questions.data?.length ?? 0} resultado(s)</span>
        </div>

        {questions.data?.length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhuma questão encontrada.</CardContent></Card>
        )}

        <div className="space-y-4">
          {questions.data?.map((q: any) => (
            <Card key={q.id} className="border-l-4 border-l-secondary">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-primary text-primary-foreground">Nível {q.level}</Badge>
                      {q.number && <Badge variant="outline">Q{q.number}</Badge>}
                      <Badge className="bg-secondary text-secondary-foreground">Gab: {q.correct}</Badge>
                      <span className="text-xs text-muted-foreground">{q.themes?.name}{q.subthemes?.name ? ` › ${q.subthemes.name}` : ""}</span>
                    </div>
                    {q.intro && <p className="text-sm text-muted-foreground line-clamp-2">{q.intro}</p>}
                    <p className="text-sm font-medium line-clamp-2">{q.command}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(q)}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir esta questão?")) del.mutate(q.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function rowToForm(q: any): Form {
  return {
    theme_id: q.theme_id,
    subtheme_id: q.subtheme_id ?? "",
    level: q.level,
    number: q.number?.toString() ?? "",
    intro: q.intro ?? "",
    command: q.command ?? "",
    alt_a: q.alt_a ?? "",
    alt_b: q.alt_b ?? "",
    alt_c: q.alt_c ?? "",
    alt_d: q.alt_d ?? "",
    alt_e: q.alt_e ?? "",
    correct: q.correct,
    exp_a: q.exp_a ?? "",
    exp_b: q.exp_b ?? "",
    exp_c: q.exp_c ?? "",
    exp_d: q.exp_d ?? "",
    exp_e: q.exp_e ?? "",
  };
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
