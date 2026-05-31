import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, Wand2, Copy, X } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({ themeId: z.string().optional() });

export const Route = createFileRoute("/questions")({
  head: () => ({ meta: [{ title: "Cadastrar questões — Questão de Sucesso" }] }),
  validateSearch: searchSchema,
  component: QuestionsPage,
});

type Form = {
  theme_id: string;
  subtheme_id: string;
  content_ids: string[];
  level: number;
  number: string;
  intro: string;
  command: string;
  alt_a: string;
  alt_b: string;
  alt_c: string;
  alt_d: string;
  alt_e: string;
  correct: "A" | "B" | "C" | "D" | "E";
  exp_a: string;
  exp_b: string;
  exp_c: string;
  exp_d: string;
  exp_e: string;
};

type LastQuestionContext = Pick<Form, "theme_id" | "subtheme_id" | "level" | "content_ids">;
type TextFieldKey = "intro" | "command" | "alt_a" | "alt_b" | "alt_c" | "alt_d" | "alt_e" | "exp_a" | "exp_b" | "exp_c" | "exp_d" | "exp_e";

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
  theme_id,
  subtheme_id: "",
  content_ids: [],
  level: 1,
  number: "",
  intro: "",
  command: "",
  alt_a: "",
  alt_b: "",
  alt_c: "",
  alt_d: "",
  alt_e: "",
  correct: "A",
  exp_a: "",
  exp_b: "",
  exp_c: "",
  exp_d: "",
  exp_e: "",
});

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function QuestionsPage() {
  const { themeId } = Route.useSearch();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(emptyForm(themeId ?? ""));
  const [pasteText, setPasteText] = useState("");
  const [newContentName, setNewContentName] = useState("");

  useEffect(() => {
    const last = loadLastQuestionContext();
    setForm((current) => {
      if (themeId) return { ...current, theme_id: themeId };
      if (!last) return current;
      return {
        ...current,
        theme_id: last.theme_id || current.theme_id,
        subtheme_id: last.subtheme_id || "",
        content_ids: last.content_ids ?? [],
        level: last.level || current.level,
      };
    });
  }, [themeId]);

  const themes = useQuery({
    queryKey: ["themes-list"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("themes")
        .select("*, subthemes(*, programmatic_contents(*))")
        .order("name");
      return data ?? [];
    },
  });

  const selectedTheme = useMemo(
    () => themes.data?.find((theme: any) => theme.id === form.theme_id),
    [themes.data, form.theme_id]
  );

  const selectedSubtheme = useMemo(
    () => selectedTheme?.subthemes?.find((subtheme: any) => subtheme.id === form.subtheme_id),
    [selectedTheme, form.subtheme_id]
  );

  const availableContents = selectedSubtheme?.programmatic_contents ?? [];
  const selectedContents = availableContents.filter((content: any) => form.content_ids.includes(content.id));

  const createContent = useMutation({
    mutationFn: async () => {
      if (!form.subtheme_id) throw new Error("Selecione um subtema antes de criar conteúdo programático.");

      const similar = availableContents.find((content: any) => similarity(content.name, newContentName) >= 0.55);
      if (similar) {
        const replace = !confirm(
          `Já existe conteúdo programático similar.\n\nExistente: ${similar.name}\nDescrição: ${similar.description ?? "—"}\n\nNovo: ${newContentName}\n\nOK = cadastrar novo\nCancelar = substituir o existente`
        );

        if (replace) {
          const { error } = await (supabase as any)
            .from("programmatic_contents")
            .update({ name: newContentName })
            .eq("id", similar.id);
          if (error) throw error;
          return similar.id;
        }
      }

      const { data, error } = await (supabase as any)
        .from("programmatic_contents")
        .insert({ subtheme_id: form.subtheme_id, name: newContentName })
        .select("id")
        .single();

      if (error) throw error;
      return data.id as string;
    },
    onSuccess: async (id) => {
      setNewContentName("");
      setForm((current) => ({ ...current, content_ids: Array.from(new Set([...current.content_ids, id])) }));
      await qc.invalidateQueries({ queryKey: ["themes-list"] });
      toast.success("Conteúdo programático salvo e vinculado à questão");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
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
        updated_until: todayISODate(),
      } as any;

      const { data, error } = await supabase.from("questions").insert(payload).select("id").single();
      if (error) throw error;

      if (form.content_ids.length > 0) {
        const rows = form.content_ids.map((content_id) => ({ question_id: data.id, content_id }));
        const { error: relError } = await (supabase as any).from("question_programmatic_contents").insert(rows);
        if (relError) throw relError;
      }
    },
    onSuccess: () => {
      saveLastQuestionContext({
        theme_id: form.theme_id,
        subtheme_id: form.subtheme_id,
        content_ids: form.content_ids,
        level: form.level,
      });
      toast.success("Questão cadastrada");
      setForm({ ...emptyForm(form.theme_id), subtheme_id: form.subtheme_id, content_ids: form.content_ids, level: form.level });
      setPasteText("");
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function updateField(field: TextFieldKey, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyPaste() {
    const parsed = parseTagged(pasteText);
    if (!parsed) {
      toast.error("Não consegui identificar as tags. Use o modelo no formato <enunciado>...</enunciado>.");
      return;
    }
    setForm((current) => ({ ...current, ...parsed }));
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

  function toggleContent(id: string) {
    setForm((current) => ({
      ...current,
      content_ids: current.content_ids.includes(id)
        ? current.content_ids.filter((contentId) => contentId !== id)
        : [...current.content_ids, id],
    }));
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
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Cadastrar questões</h1>
          <p className="text-muted-foreground">Use a entrada por tags para preencher rapidamente uma questão por vez.</p>
        </div>

        <Card>
          <CardHeader className="bg-primary text-primary-foreground">
            <CardTitle>Nova questão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
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
                <Textarea rows={10} value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={TAG_TEMPLATE} className="font-mono text-xs" />
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

            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Atualizada até: <strong>{formatDate(todayISODate())}</strong>. Essa informação é interna e não aparece na exportação.
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <Label>Tema</Label>
                <Select value={form.theme_id} onValueChange={(value) => setForm({ ...form, theme_id: value, subtheme_id: "", content_ids: [] })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{themes.data?.map((theme: any) => <SelectItem key={theme.id} value={theme.id}>{theme.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div>
                <Label>Subtema</Label>
                <Select value={form.subtheme_id} onValueChange={(value) => setForm({ ...form, subtheme_id: value, content_ids: [] })} disabled={!selectedTheme?.subthemes?.length}>
                  <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                  <SelectContent>{selectedTheme?.subthemes?.map((subtheme: any) => <SelectItem key={subtheme.id} value={subtheme.id}>{subtheme.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div>
                <Label>Nível</Label>
                <Select value={String(form.level)} onValueChange={(value) => setForm({ ...form, level: Number(value) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[1, 2, 3, 4].map((level) => <SelectItem key={level} value={String(level)}>Nível {level}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div>
                <Label>Número</Label>
                <Input type="number" value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} />
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <Label>Conteúdo programático da questão</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {availableContents.map((content: any) => (
                  <button
                    type="button"
                    key={content.id}
                    onClick={() => toggleContent(content.id)}
                    className={`rounded-full border px-3 py-1 text-xs ${form.content_ids.includes(content.id) ? "bg-primary text-primary-foreground" : "bg-background"}`}
                  >
                    {content.name}
                  </button>
                ))}
                {availableContents.length === 0 && <span className="text-xs text-muted-foreground">Nenhum conteúdo cadastrado para este subtema.</span>}
              </div>

              <div className="mt-3 flex gap-2">
                <Input value={newContentName} onChange={(event) => setNewContentName(event.target.value)} placeholder="Novo conteúdo programático" disabled={!form.subtheme_id} />
                <Button type="button" variant="outline" disabled={!form.subtheme_id || !newContentName.trim() || createContent.isPending} onClick={() => createContent.mutate()}>
                  <Plus className="h-4 w-4 mr-1" /> Criar e vincular
                </Button>
              </div>

              {selectedContents.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedContents.map((content: any) => (
                    <Badge key={content.id} variant="outline">
                      {content.name}
                      <button type="button" onClick={() => toggleContent(content.id)} className="ml-1">
                        <X className="inline h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <TextField label="Enunciado (texto introdutório)" field="intro" rows={4} value={form.intro} onChange={updateField} />
            <TextField label="Comando da questão" field="command" rows={3} value={form.command} onChange={updateField} />

            {(["a", "b", "c", "d", "e"] as const).map((letter) => (
              <div key={letter} className="grid grid-cols-[auto_1fr] gap-2 items-start">
                <div className="bg-primary text-primary-foreground rounded-md w-9 h-9 flex items-center justify-center font-bold mt-7">
                  {letter.toUpperCase()}
                </div>
                <div className="space-y-2">
                  <TextField label={`Alternativa ${letter.toUpperCase()}`} field={`alt_${letter}` as TextFieldKey} rows={2} value={form[`alt_${letter}` as const]} onChange={updateField} compact />
                  <TextField label={`Comentário ${letter.toUpperCase()}`} field={`exp_${letter}` as TextFieldKey} rows={2} value={form[`exp_${letter}` as const]} onChange={updateField} compact muted />
                </div>
              </div>
            ))}

            <div>
              <Label>Gabarito</Label>
              <Select value={form.correct} onValueChange={(value) => setForm({ ...form, correct: value as Form["correct"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["A", "B", "C", "D", "E"].map((letter) => <SelectItem key={letter} value={letter}>{letter}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <Button onClick={handleSave} disabled={!canSave} className="w-full bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" /> Cadastrar questão
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function TextField({ label, field, value, rows, onChange, compact = false, muted = false }: {
  label: string;
  field: TextFieldKey;
  value: string;
  rows: number;
  onChange: (field: TextFieldKey, value: string) => void;
  compact?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <Label className={compact ? `text-xs ${muted ? "text-muted-foreground" : ""}` : undefined}>{label}</Label>
      <Textarea rows={rows} value={value} onChange={(event) => onChange(field, event.target.value)} placeholder="Digite o texto." />
    </div>
  );
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
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<${escapedTag}>\\s*([\\s\\S]*?)\\s*<\\/${escapedTag}>`, "i");
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
  if (form.content_ids.length === 0) missing.push("Conteúdo programático");
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
  } catch {}
}

function loadLastQuestionContext(): LastQuestionContext | null {
  try {
    const raw = localStorage.getItem(LAST_QUESTION_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      theme_id: parsed.theme_id || "",
      subtheme_id: parsed.subtheme_id || "",
      content_ids: Array.isArray(parsed.content_ids) ? parsed.content_ids : [],
      level: Number(parsed.level) || 1,
    };
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function normalize(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.86;

  const aw = new Set(na.split(" ").filter((word) => word.length > 2));
  const bw = new Set(nb.split(" ").filter((word) => word.length > 2));
  const intersection = [...aw].filter((word) => bw.has(word)).length;
  const union = new Set([...aw, ...bw]).size || 1;
  return intersection / union;
}
