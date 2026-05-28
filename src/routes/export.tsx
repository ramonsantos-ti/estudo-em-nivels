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
import { exportDocx, exportPdf } from "@/lib/exporters";
import { FileText, FileDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/export")({
  head: () => ({ meta: [{ title: "Exportar — Questão de Sucesso" }] }),
  component: ExportPage,
});

function ExportPage() {
  const [title, setTitle] = useState("Caderno de Questões");
  const [themeId, setThemeId] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [busy, setBusy] = useState<null | "docx" | "pdf">(null);

  const themes = useQuery({
    queryKey: ["themes-list"],
    queryFn: async () => (await supabase.from("themes").select("id, name").order("name")).data ?? [],
  });

  const questions = useQuery({
    queryKey: ["export-questions", themeId, level],
    queryFn: async () => {
      let q = supabase.from("questions").select("*, themes(name), subthemes(name)").order("level").order("number");
      if (themeId !== "all") q = q.eq("theme_id", themeId);
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

  async function handle(format: "docx" | "pdf") {
    if (!questions.data || questions.data.length === 0) {
      toast.error("Nenhuma questão para exportar com os filtros atuais."); return;
    }
    setBusy(format);
    try {
      const opts = { title: title.trim() || "Caderno de Questões", questions: questions.data as any, includeAnswers };
      if (format === "docx") await exportDocx(opts);
      else await exportPdf(opts);
      toast.success(`Arquivo ${format.toUpperCase()} gerado!`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Exportar ebook</h1>
          <p className="text-muted-foreground">Gere um arquivo DOCX ou PDF com a identidade visual da Questão de Sucesso.</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Configuração</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Título do caderno</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tema</Label>
                <Select value={themeId} onValueChange={setThemeId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os temas</SelectItem>
                    {themes.data?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
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
              <span className="text-sm">Incluir gabarito comentado ao final</span>
            </label>
          </CardContent>
        </Card>

        <Card className="bg-muted/40">
          <CardContent className="py-4">
            <p className="text-sm font-medium">{questions.data?.length ?? 0} questões selecionadas</p>
            <div className="text-xs text-muted-foreground mt-1 flex gap-4">
              {byLevel.map((b) => <span key={b.lv}>Nível {b.lv}: <strong>{b.n}</strong></span>)}
            </div>
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