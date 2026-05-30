import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Eye, ImagePlus, Plus, Wand2, Copy } from "lucide-react";
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
  level: number;
  number: string;
  intro: string;
  command: string;
  alt_a: string; alt_b: string; alt_c: string; alt_d: string; alt_e: string;
  correct: "A" | "B" | "C" | "D" | "E";
  exp_a: string; exp_b: string; exp_c: string; exp_d: string; exp_e: string;
};

type LastQuestionContext = Pick<Form, "theme_id" | "subtheme_id" | "level">;
type TextFieldKey = "intro" | "command" | "alt_a" | "alt_b" | "alt_c" | "alt_d" | "alt_e" | "exp_a" | "exp_b" | "exp_c" | "exp_d" | "exp_e";
type ParsedSegment = { type: "text"; value: string } | { type: "image"; src: string; width: number };

const LAST_QUESTION_CONTEXT_KEY = "questaoDeSucesso:lastQuestionContext";
const IMAGE_TOKEN_PATTERN = /\[imagem\s+largura=(\d{1,3})\s*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+)\)/g;

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

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function QuestionsPage() {
  const { themeId } = Route.useSearch();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(emptyForm(themeId ?? ""));
  const [pasteText, setPasteText] = useState("");
  const [showPreview, setShowPreview] = useState(false);

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
      const { error } = await supabase.from("questions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      saveLastQuestionContext({ theme_id: form.theme_id, subtheme_id: form.subtheme_id, level: form.level });
      toast.success("Questão cadastrada");
      setForm({ ...emptyForm(form.theme_id), subtheme_id: form.subtheme_id, level: form.level });
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

  async function insertImage(field: TextFieldKey, file: File | undefined, width: number) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const token = `\n[imagem largura=${clamp(width, 10, 100)}](${dataUrl})\n`;
      updateField(field, `${form[field] || ""}${token}`);
      toast.success("Imagem inserida no campo. Ajuste a largura se necessário.");
    } catch (error: any) {
      toast.error(error.message || "Não foi possível inserir a imagem.");
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
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-primary">Cadastrar questões</h1>
            <p className="text-muted-foreground">Use a entrada por tags para preencher rapidamente uma questão por vez.</p>
          </div>

          <Card>
            <CardHeader className="bg-primary text-primary-foreground"><CardTitle>Nova questão</CardTitle></CardHeader>
            <CardContent className="space-y-4 pt-6">
              <details className="bg-muted/40 rounded-md p-3" open>
                <summary className="cursor-pointer text-sm font-medium text-primary flex items-center gap-2"><Wand2 className="h-4 w-4" /> Entrada rápida por tags</summary>
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Cole uma questão por vez usando tags. Depois clique em <strong>Interpretar texto</strong>; os campos abaixo continuarão editáveis antes de salvar.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" type="button" variant="outline" onClick={copyTemplate}><Copy className="h-4 w-4 mr-2" /> Copiar modelo</Button>
                    <Button size="sm" type="button" variant="outline" onClick={() => setPasteText(TAG_TEMPLATE)}>Inserir modelo no campo</Button>
                  </div>
                  <Textarea rows={10} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={TAG_TEMPLATE} className="font-mono text-xs" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={applyPaste} disabled={!pasteText.trim()}>Interpretar texto</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPasteText("")} disabled={!pasteText.trim()}>Limpar</Button>
                  </div>
                </div>
              </details>

              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Atualizada até: <strong>{formatDate(todayISODate())}</strong>. Essa informação é interna e não aparece na exportação.</div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tema</Label>
                  <Select value={form.theme_id} onValueChange={(v) => setForm({ ...form, theme_id: v, subtheme_id: "" })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{themes.data?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Subtema</Label>
                  <Select value={form.subtheme_id} onValueChange={(v) => setForm({ ...form, subtheme_id: v })} disabled={!selectedTheme?.subthemes?.length}>
                    <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                    <SelectContent>{selectedTheme?.subthemes?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
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
                  <Label>Número (opcional)</Label>
                  <Input type="number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
                </div>
              </div>

              <RichTextField label="Enunciado (texto introdutório)" field="intro" rows={4} value={form.intro} onChange={updateField} onInsertImage={insertImage} />
              <RichTextField label="Comando da questão" field="command" rows={3} value={form.command} onChange={updateField} onInsertImage={insertImage} />

              {(["a", "b", "c", "d", "e"] as const).map((l) => (
                <div key={l} className="grid grid-cols-[auto_1fr] gap-2 items-start">
                  <div className="bg-primary text-primary-foreground rounded-md w-9 h-9 flex items-center justify-center font-bold mt-7">{l.toUpperCase()}</div>
                  <div className="space-y-2">
                    <RichTextField label={`Alternativa ${l.toUpperCase()}`} field={`alt_${l}` as TextFieldKey} rows={2} value={form[`alt_${l}` as const]} onChange={updateField} onInsertImage={insertImage} compact />
                    <RichTextField label={`Comentário ${l.toUpperCase()}`} field={`exp_${l}` as TextFieldKey} rows={2} value={form[`exp_${l}` as const]} onChange={updateField} onInsertImage={insertImage} compact muted />
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

              <div className="grid gap-3 md:grid-cols-2">
                <Button type="button" variant="outline" onClick={() => setShowPreview(true)}><Eye className="h-4 w-4 mr-2" /> Visualizar questão</Button>
                <Button onClick={handleSave} disabled={!canSave} className="bg-primary hover:bg-primary/90"><Plus className="h-4 w-4 mr-2" /> Cadastrar questão</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader className="bg-primary text-primary-foreground"><CardTitle>Pré-visualização de impressão</CardTitle></CardHeader>
            <CardContent className="pt-6">
              {showPreview ? <PrintPreview form={form} /> : <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">Clique em <strong>Visualizar questão</strong> para conferir a diagramação antes de salvar.</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function RichTextField({ label, field, value, rows, onChange, onInsertImage, compact = false, muted = false }: { label: string; field: TextFieldKey; value: string; rows: number; onChange: (field: TextFieldKey, value: string) => void; onInsertImage: (field: TextFieldKey, file: File | undefined, width: number) => void; compact?: boolean; muted?: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [imageWidth, setImageWidth] = useState(45);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label className={compact ? `text-xs ${muted ? "text-muted-foreground" : ""}` : undefined}>{label}</Label>
        <div className="flex items-center gap-1">
          <Input type="number" min={10} max={100} value={imageWidth} onChange={(event) => setImageWidth(Number(event.target.value) || 45)} className="h-7 w-16 text-xs" title="Largura da imagem em %" />
          <span className="text-xs text-muted-foreground">%</span>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { onInsertImage(field, event.target.files?.[0], imageWidth); event.currentTarget.value = ""; }} />
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => inputRef.current?.click()} title="Inserir imagem neste campo">
            <ImagePlus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <Textarea rows={rows} value={value} onChange={(e) => onChange(field, e.target.value)} placeholder="Digite o texto. Use o botão de imagem para inserir uma imagem no final do campo." />
      {value.includes("[imagem") && <p className="mt-1 text-[11px] text-muted-foreground">A imagem será armazenada como marcação no texto: [imagem largura=X](arquivo).</p>}
    </div>
  );
}

function PrintPreview({ form }: { form: Form }) {
  const number = form.number || "X";
  return (
    <div className="grid gap-4 2xl:grid-cols-2">
      <PreviewPage title={`QUESTÃO ${number}`}>
        <div className="rounded-lg border border-blue-200 bg-white p-3 text-center text-[12px] font-bold text-primary">
          <RichTextPreview value={form.intro} justify />
          {form.intro && form.command && <div className="my-3" />}
          <RichTextPreview value={form.command} center />
        </div>
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2">
          {(["A", "B", "C", "D", "E"] as const).map((letter) => (
            <div key={letter} className="mb-2 grid grid-cols-[32px_1fr] overflow-hidden rounded-md border bg-white last:mb-0">
              <div className="flex items-center justify-center bg-primary font-bold text-secondary">{letter}</div>
              <div className="p-2 text-[11px] font-bold text-primary"><RichTextPreview value={form[`alt_${letter.toLowerCase()}` as keyof Form] as string} /></div>
            </div>
          ))}
        </div>
      </PreviewPage>
      <PreviewPage title={`GABARITO — QUESTÃO ${number}`}>
        <div className="mb-3 text-right text-sm font-bold text-green-700">Gabarito: {form.correct}</div>
        <div className="text-center text-sm font-bold text-primary">Explicação das alternativas</div>
        <div className="mt-3 space-y-2">
          {(["A", "B", "C", "D", "E"] as const).map((letter) => {
            const correct = form.correct === letter;
            const key = `exp_${letter.toLowerCase()}` as keyof Form;
            return <div key={letter} className={`grid grid-cols-[34px_1fr] overflow-hidden rounded-md border ${correct ? "border-green-400 bg-green-100" : "bg-white"}`}>
              <div className={`flex items-start justify-center pt-2 font-bold text-white ${correct ? "bg-green-700" : "bg-primary"}`}>{letter}</div>
              <div className="p-2 text-[11px] font-bold text-primary text-justify"><span className={correct ? "text-green-700" : "text-red-600"}>{correct ? "Correta: " : "Incorreta: "}</span><RichTextPreview value={form[key] as string} inline /></div>
            </div>;
          })}
        </div>
      </PreviewPage>
    </div>
  );
}

function PreviewPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mx-auto aspect-[595/842] w-full max-w-[360px] overflow-hidden rounded-lg border bg-[#f8fbff] p-5 shadow"><div className="mb-3 rounded-md border bg-white p-2 text-center text-sm font-bold text-primary">{title}</div>{children}</div>;
}

function RichTextPreview({ value, justify = false, center = false, inline = false }: { value: string; justify?: boolean; center?: boolean; inline?: boolean }) {
  const segments = parseRichSegments(value);
  const content = segments.map((segment, index) => segment.type === "text"
    ? <span key={index} className="whitespace-pre-wrap">{segment.value}</span>
    : <img key={index} src={segment.src} alt="Imagem inserida" style={{ width: `${segment.width}%` }} className={`${inline ? "my-1" : "mx-auto my-2"} max-w-full rounded border`} />
  );
  if (inline) return <>{content}</>;
  return <div className={`${justify ? "text-justify" : ""} ${center ? "text-center" : ""}`}>{content}</div>;
}

function parseRichSegments(value: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  let lastIndex = 0;
  const regex = new RegExp(IMAGE_TOKEN_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    if (match.index > lastIndex) segments.push({ type: "text", value: value.slice(lastIndex, match.index) });
    segments.push({ type: "image", width: clamp(Number(match[1]) || 45, 10, 100), src: match[2] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < value.length) segments.push({ type: "text", value: value.slice(lastIndex) });
  return segments;
}

function parseTagged(text: string): Partial<Form> | null {
  const entries: Array<[string, keyof Form]> = [
    ["enunciado", "intro"], ["comando_questão", "command"], ["comando_questao", "command"],
    ["alternativa_a", "alt_a"], ["alternativa_b", "alt_b"], ["alternativa_c", "alt_c"], ["alternativa_d", "alt_d"], ["alternativa_e", "alt_e"],
    ["comentario_a", "exp_a"], ["comentário_a", "exp_a"], ["comentario_b", "exp_b"], ["comentário_b", "exp_b"], ["comentario_c", "exp_c"], ["comentário_c", "exp_c"], ["comentario_d", "exp_d"], ["comentário_d", "exp_d"], ["comentario_e", "exp_e"], ["comentário_e", "exp_e"],
  ];
  const parsed: Partial<Form> = {};
  let found = false;
  for (const [tag, field] of entries) {
    const value = extractTag(text, tag);
    if (value) { (parsed as any)[field] = value; found = true; }
  }
  const correct = normalizeCorrectAnswer(extractTag(text, "gabarito"));
  if (correct) { parsed.correct = correct; found = true; }
  return found ? parsed : null;
}

function extractTag(source: string, tag: string) {
  const pattern = new RegExp(`<${tag}>\s*([\s\S]*?)\s*<\/${tag}>`, "i");
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
  try { localStorage.setItem(LAST_QUESTION_CONTEXT_KEY, JSON.stringify(context)); } catch {}
}
function loadLastQuestionContext(): LastQuestionContext | null {
  try {
    const raw = localStorage.getItem(LAST_QUESTION_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { theme_id: parsed.theme_id || "", subtheme_id: parsed.subtheme_id || "", level: Number(parsed.level) || 1 };
  } catch { return null; }
}
function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
