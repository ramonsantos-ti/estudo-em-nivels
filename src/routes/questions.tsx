import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Wand2, Copy } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({ themeId: z.string().optional() });

export const Route = createFileRoute("/questions")({
  head: () => ({ meta: [{ title: "Questões — Questão de Sucesso" }] }),
  validateSearch: searchSchema,
  component: QuestionsPage,
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

type LastQuestionContext = Pick<Form, "theme_id" | "subtheme_id" | "level">;

const LAST_QUESTION_CONTEXT_KEY = "questaoDeSucesso:lastQuestionContext";

const TAG_TEMPLATE = `<enunciado>
#texto#
</enunciado>

<comando_questão>
#texto#
</comando_questão>

<alternativa_a>
#texto#
</alternativa_a>

<alternativa_b>
#texto#
</alternativa_b>

<alternativa_c>
#texto#
</alternativa_c>

<alternativa_d>
#texto#
</alternativa_d>

<alternativa_e>
#texto#
</alternativa_e>

<gabarito>
#texto#
</gabarito>

<comentario_a>
#texto#
</comentario_a>

<comentario_b>
#texto#
</comentario_b>

<comentario_c>
#texto#
</comentario_c>

<comentario_d>
#texto#
</comentario_d>

<comentario_e>
#texto#
</comentario_e>`;

const emptyForm = (theme_id = ""): Form => ({
  theme_id, subtheme_id: "", level: 1, number: "",
  intro: "", command: "",
  alt_a: "", alt_b: "", alt_c: "", alt_d: "", alt_e: "",
  correct: "A",
  exp_a: "", exp_b: "", exp_c: "", exp_d: "", exp_e: "",
});

function QuestionsPage() {
  const { themeId } = Route.useSearch();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(emptyForm(themeId ?? ""));
  const [pasteText, setPasteText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const last = loadLastQuestionContext();
    setForm((current) => {
      if (themeId) return { ...current, theme_id: themeId };
      if (!last) return current;
      return {
        ...current,
        theme_id: last.theme_id || current.theme_id,
        subtheme_id: last.subtheme_id || "",
        level: last.level || current.level,
      };
    });
  }, [themeId]);

  const themes = useQuery({
    queryKey: ["themes-list"],
    queryFn: async () => {
      const { data } = await supabase.from("themes").select("*, subthemes(*)").order("name");
      return data ?? [];
    },
  });

  const questions = useQuery({
    queryKey: ["questions", form.theme_id || themeId],
    queryFn: async () => {
      let q = supabase.from("questions").select("*, themes(name), subthemes(name)").order("created_at", { ascending: false });
      const tid = form.theme_id || themeId;
      if (tid) q = q.eq("theme_id", tid);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const selectedTheme = useMemo(
    () => themes.data?.find((t: any) => t.id === form.theme_id),
    [themes.data, form.theme_id]
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        theme_id: form.theme_id,
        subtheme_id: form.subtheme_id || null,
        level: form.level,
        number: form.number ? parseInt(form.number) : null,
        intro: form.intro || null,
        command: form.command,
        alt_a: form.alt_a, alt_b: form.alt_b, alt_c: form.alt_c, alt_d: form.alt_d, alt_e: form.alt_e,
        correct: form.correct,
        exp_a: form.exp_a || null, exp_b: form.exp_b || null, exp_c: form.exp_c || null, exp_d: form.exp_d || null, exp_e: form.exp_e || null,
      };
      if (editingId) {
        const { error } = await supabase.from("questions").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("questions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      saveLastQuestionContext({
        theme_id: form.theme_id,
        subtheme_id: form.subtheme_id,
        level: form.level,
      });
      toast.success(editingId ? "Questão atualizada" : "Questão cadastrada");
      setForm({ ...emptyForm(form.theme_id), subtheme_id: form.subtheme_id, level: form.level });
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["questions"] }),
  });

  function applyPaste() {
    const parsed = parseTagged(pasteText);
    if (!parsed) {
      toast.error("Não consegui identificar as tags. Use o modelo no formato <enunciado>...</enunciado>.");
      return;
    }
    setForm((f) => ({ ...f, ...parsed }));
    toast.success("Campos preenchidos a partir do texto com tags.");
  }

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(TAG_TEMPLATE);
      toast.success("Modelo copiado");
    } catch {
      setPasteText(TAG_TEMPLATE);
      toast.info("Não consegui copiar automaticamente. Inserir o modelo no campo.");
    }
  }

  function handleSave() {
    if (!form.theme_id) {
      toast.error("Selecione um tema antes de salvar.");
      return;
    }

    const missing = getMissingFields(form);
    if (missing.length > 0) {
      const ok = confirm(`As seguintes informações estão faltando:\n\n- ${missing.join("\n- ")}\n\nQuer salvar assim mesmo?`);
      if (!ok) return;
    }

    save.mutate();
  }

  const canSave = !!form.theme_id && !save.isPending;

  return (
    <AppShell>
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        {/* Form */}
        <Card>
          <CardHeader className="bg-primary text-primary-foreground">
            <CardTitle>{editingId ? "Editar questão" : "Nova questão"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {/* Paste with tags */}
            <details className="bg-muted/40 rounded-md p-3" open>
              <summary className="cursor-pointer text-sm font-medium text-primary flex items-center gap-2">
                <Wand2 className="h-4 w-4" /> Entrada rápida por tags
              </summary>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Cole uma questão por vez usando tags. Depois clique em <strong>Interpretar texto</strong>; os campos abaixo continuarão editáveis antes de salvar.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" type="button" variant="outline" onClick={copyTemplate}>
                    <Copy className="h-4 w-4 mr-2" /> Copiar modelo
                  </Button>
                  <Button size="sm" type="button" variant="outline" onClick={() => setPasteText(TAG_TEMPLATE)}>
                    Inserir modelo no campo
                  </Button>
                </div>
                <Textarea
                  rows={10}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={TAG_TEMPLATE}
                  className="font-mono text-xs"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={applyPaste} disabled={!pasteText.trim()}>
                    Interpretar texto
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPasteText("")} disabled={!pasteText.trim()}>
                    Limpar
                  </Button>
                </div>
              </div>
            </details>

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
                <Select value={form.subtheme_id} onValueChange={(v) => setForm({ ...form, subtheme_id: v })} disabled={!selectedTheme?.subthemes?.length}>
                  <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                  <SelectContent>
                    {selectedTheme?.subthemes?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nível</Label>
                <Select value={String(form.level)} onValueChange={(v) => setForm({ ...form, level: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>Nível {n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Número (opcional)</Label>
                <Input type="number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Enunciado (texto introdutório)</Label>
              <Textarea rows={3} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} />
            </div>
            <div>
              <Label>Comando da questão</Label>
              <Textarea rows={2} value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} />
            </div>

            {(["a","b","c","d","e"] as const).map((l) => (
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
                <SelectContent>
                  {["A","B","C","D","E"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={!canSave} className="bg-primary hover:bg-primary/90 flex-1">
                <Plus className="h-4 w-4 mr-2" /> {editingId ? "Salvar alterações" : "Cadastrar questão"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={() => { setEditingId(null); setForm({ ...emptyForm(form.theme_id), subtheme_id: form.subtheme_id, level: form.level }); }}>
                  Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-primary">Questões cadastradas</h2>
            <Link to="/export"><Button variant="outline" size="sm" className="border-primary text-primary">Exportar →</Button></Link>
          </div>
          {questions.data?.length === 0 && (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhuma questão.</CardContent></Card>
          )}
          {questions.data?.map((q: any) => (
            <Card key={q.id} className="border-l-4 border-l-secondary">
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-primary text-primary-foreground">Nível {q.level}</Badge>
                      {q.number && <Badge variant="outline">Q{q.number}</Badge>}
                      <Badge className="bg-secondary text-secondary-foreground">Gab: {q.correct}</Badge>
                      <span className="text-xs text-muted-foreground">{q.themes?.name}{q.subthemes?.name ? ` › ${q.subthemes.name}` : ""}</span>
                    </div>
                    <p className="text-sm mt-2 line-clamp-2">{q.command}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(q.id); setForm(rowToForm(q)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir?")) del.mutate(q.id); }}>
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
    theme_id: q.theme_id, subtheme_id: q.subtheme_id ?? "", level: q.level,
    number: q.number?.toString() ?? "", intro: q.intro ?? "", command: q.command ?? "",
    alt_a: q.alt_a ?? "", alt_b: q.alt_b ?? "", alt_c: q.alt_c ?? "", alt_d: q.alt_d ?? "", alt_e: q.alt_e ?? "",
    correct: q.correct,
    exp_a: q.exp_a ?? "", exp_b: q.exp_b ?? "", exp_c: q.exp_c ?? "", exp_d: q.exp_d ?? "", exp_e: q.exp_e ?? "",
  };
}

function parseTagged(text: string): Partial<Form> | null {
  const entries: Array<[string, keyof Form]> = [
    ["enunciado", "intro"],
    ["comando_questão", "command"],
    ["comando_questao", "command"],
    ["alternativa_a", "alt_a"],
    ["alternativa_b", "alt_b"],
    ["alternativa_c", "alt_c"],
    ["alternativa_d", "alt_d"],
    ["alternativa_e", "alt_e"],
    ["comentario_a", "exp_a"],
    ["comentário_a", "exp_a"],
    ["comentario_b", "exp_b"],
    ["comentário_b", "exp_b"],
    ["comentario_c", "exp_c"],
    ["comentário_c", "exp_c"],
    ["comentario_d", "exp_d"],
    ["comentário_d", "exp_d"],
    ["comentario_e", "exp_e"],
    ["comentário_e", "exp_e"],
  ];

  const parsed: Partial<Form> = {};
  let found = false;

  for (const [tag, field] of entries) {
    const value = extractTag(text, tag);
    if (value) {
      (parsed as any)[field] = value;
      found = true;
    }
  }

  const correct = normalizeCorrectAnswer(extractTag(text, "gabarito"));
  if (correct) {
    parsed.correct = correct;
    found = true;
  }

  return found ? parsed : null;
}

function extractTag(source: string, tag: string) {
  const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`, "i");
  const match = source.match(pattern);
  return cleanTaggedValue(match?.[1] ?? "");
}

function cleanTaggedValue(value: string) {
  const trimmed = value.trim();
  const withoutHash = trimmed.replace(/^#\s*/, "").replace(/\s*#$/, "").trim();
  return withoutHash === "texto" ? "" : withoutHash;
}

function normalizeCorrectAnswer(value: string): Form["correct"] | "" {
  const clean = value.trim().toUpperCase();
  if (["A", "B", "C", "D", "E"].includes(clean)) return clean as Form["correct"];
  return (clean.match(/[A-E]/)?.[0] as Form["correct"] | undefined) ?? "";
}

function getMissingFields(form: Form) {
  const missing: string[] = [];
  if (!form.subtheme_id) missing.push("Subtema");
  if (!form.number) missing.push("Número da questão");
  if (!form.intro.trim()) missing.push("Enunciado");
  if (!form.command.trim()) missing.push("Comando da questão");
  if (!form.alt_a.trim()) missing.push("Alternativa A");
  if (!form.alt_b.trim()) missing.push("Alternativa B");
  if (!form.alt_c.trim()) missing.push("Alternativa C");
  if (!form.alt_d.trim()) missing.push("Alternativa D");
  if (!form.alt_e.trim()) missing.push("Alternativa E");
  if (!form.exp_a.trim()) missing.push("Comentário A");
  if (!form.exp_b.trim()) missing.push("Comentário B");
  if (!form.exp_c.trim()) missing.push("Comentário C");
  if (!form.exp_d.trim()) missing.push("Comentário D");
  if (!form.exp_e.trim()) missing.push("Comentário E");
  return missing;
}

function saveLastQuestionContext(context: LastQuestionContext) {
  try {
    localStorage.setItem(LAST_QUESTION_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

function loadLastQuestionContext(): LastQuestionContext | null {
  try {
    const raw = localStorage.getItem(LAST_QUESTION_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      theme_id: parsed.theme_id || "",
      subtheme_id: parsed.subtheme_id || "",
      level: Number(parsed.level) || 1,
    };
  } catch {
    return null;
  }
}
