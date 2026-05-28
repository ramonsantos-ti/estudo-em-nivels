import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
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
import { Trash2, Plus, Wand2 } from "lucide-react";
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
      toast.success(editingId ? "Questão atualizada" : "Questão cadastrada");
      setForm(emptyForm(form.theme_id));
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
    if (!parsed) { toast.error("Não consegui identificar as tags. Use [ENUNCIADO], [COMANDO], [A]..[E], [GABARITO], [COMENT_A]..[COMENT_E]"); return; }
    setForm((f) => ({ ...f, ...parsed }));
    setPasteText("");
    toast.success("Campos preenchidos a partir do texto!");
  }

  const canSave = form.theme_id && form.command && form.alt_a && form.alt_b && form.alt_c && form.alt_d && form.alt_e;

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
            <details className="bg-muted/40 rounded-md p-3">
              <summary className="cursor-pointer text-sm font-medium text-primary flex items-center gap-2">
                <Wand2 className="h-4 w-4" /> Colar texto com tags (preenche automático)
              </summary>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Use as tags: <code>[ENUNCIADO] [COMANDO] [A] [B] [C] [D] [E] [GABARITO] [COMENT_A] ... [COMENT_E]</code>
                </p>
                <Textarea rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="[ENUNCIADO] ... [COMANDO] ... [A] ... [GABARITO] B ..." />
                <Button size="sm" onClick={applyPaste} disabled={!pasteText.trim()}>Aplicar</Button>
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
              <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending} className="bg-primary hover:bg-primary/90 flex-1">
                <Plus className="h-4 w-4 mr-2" /> {editingId ? "Salvar alterações" : "Cadastrar questão"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm(form.theme_id)); }}>
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
    number: q.number?.toString() ?? "", intro: q.intro ?? "", command: q.command,
    alt_a: q.alt_a, alt_b: q.alt_b, alt_c: q.alt_c, alt_d: q.alt_d, alt_e: q.alt_e,
    correct: q.correct,
    exp_a: q.exp_a ?? "", exp_b: q.exp_b ?? "", exp_c: q.exp_c ?? "", exp_d: q.exp_d ?? "", exp_e: q.exp_e ?? "",
  };
}

function parseTagged(text: string): Partial<Form> | null {
  const grab = (tag: string) => {
    const re = new RegExp(`\\[${tag}\\]\\s*([\\s\\S]*?)(?=\\n\\s*\\[[A-Z_]+\\]|$)`, "i");
    const m = text.match(re);
    return m?.[1]?.trim() ?? "";
  };
  const intro = grab("ENUNCIADO");
  const command = grab("COMANDO");
  const a = grab("A"), b = grab("B"), c = grab("C"), d = grab("D"), e = grab("E");
  let correct = grab("GABARITO").toUpperCase().match(/[A-E]/)?.[0] as Form["correct"] | undefined;
  if (!command && !a) return null;
  return {
    intro, command,
    alt_a: a, alt_b: b, alt_c: c, alt_d: d, alt_e: e,
    correct: correct ?? "A",
    exp_a: grab("COMENT_A"), exp_b: grab("COMENT_B"),
    exp_c: grab("COMENT_C"), exp_d: grab("COMENT_D"), exp_e: grab("COMENT_E"),
  };
}