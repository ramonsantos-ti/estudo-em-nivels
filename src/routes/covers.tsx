import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/covers")({
  head: () => ({ meta: [{ title: "Capas — Questão de Sucesso" }] }),
  component: CoversPage,
});

type CoverForm = {
  name: string;
  theme_id: string;
  title_line_1: string;
  title_line_2: string;
  title_line_3: string;
  subtitle: string;
  badge_text: string;
  quote_text: string;
  is_active: boolean;
};

const emptyForm: CoverForm = {
  name: "",
  theme_id: "none",
  title_line_1: "ESTATUTO DO",
  title_line_2: "SERVIDOR PÚBLICO",
  title_line_3: "FEDERAL",
  subtitle: "Lei nº 8.112/90",
  badge_text: "MENOS TEORIA, MAIS RESULTADO!",
  quote_text: "Seu esforço hoje, sua conquista amanhã!",
  is_active: true,
};

function CoversPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<CoverForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const themes = useQuery({
    queryKey: ["themes-list-covers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("themes").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const covers = useQuery({
    queryKey: ["covers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("covers")
        .select("*, themes(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe um nome para a capa.");
      const payload = {
        name: form.name.trim(),
        theme_id: form.theme_id === "none" ? null : form.theme_id,
        title_line_1: form.title_line_1.trim(),
        title_line_2: form.title_line_2.trim(),
        title_line_3: form.title_line_3.trim(),
        subtitle: form.subtitle.trim(),
        badge_text: form.badge_text.trim() || "MENOS TEORIA, MAIS RESULTADO!",
        quote_text: form.quote_text.trim() || "Seu esforço hoje, sua conquista amanhã!",
        is_active: form.is_active,
      };

      if (editingId) {
        const { error } = await supabase.from("covers").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("covers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Capa atualizada" : "Capa cadastrada");
      setForm(emptyForm);
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["covers"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("covers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Capa excluída");
      qc.invalidateQueries({ queryKey: ["covers"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function editCover(c: any) {
    setEditingId(c.id);
    setForm({
      name: c.name ?? "",
      theme_id: c.theme_id ?? "none",
      title_line_1: c.title_line_1 ?? "",
      title_line_2: c.title_line_2 ?? "",
      title_line_3: c.title_line_3 ?? "",
      subtitle: c.subtitle ?? "",
      badge_text: c.badge_text ?? "",
      quote_text: c.quote_text ?? "",
      is_active: Boolean(c.is_active),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function duplicateCover(c: any) {
    setEditingId(null);
    setForm({
      name: `${c.name} - cópia`,
      theme_id: c.theme_id ?? "none",
      title_line_1: c.title_line_1 ?? "",
      title_line_2: c.title_line_2 ?? "",
      title_line_3: c.title_line_3 ?? "",
      subtitle: c.subtitle ?? "",
      badge_text: c.badge_text ?? "",
      quote_text: c.quote_text ?? "",
      is_active: true,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-primary">Capas personalizadas</h1>
          <p className="text-muted-foreground">Cadastre capas reutilizáveis para os ebooks. O template mantém o padrão visual; você altera principalmente o tema e o subtítulo.</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr]">
          <Card>
            <CardHeader className="bg-primary text-primary-foreground">
              <CardTitle>{editingId ? "Editar capa" : "Nova capa"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div>
                <Label>Nome interno da capa</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Lei 8.112 - Estatuto do Servidor" />
              </div>

              <div>
                <Label>Tema relacionado (opcional)</Label>
                <Select value={form.theme_id} onValueChange={(v) => setForm({ ...form, theme_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vínculo</SelectItem>
                    {themes.data?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3">
                <div>
                  <Label>Linha 1 do título</Label>
                  <Input value={form.title_line_1} onChange={(e) => setForm({ ...form, title_line_1: e.target.value.toUpperCase() })} />
                </div>
                <div>
                  <Label>Linha 2 do título</Label>
                  <Input value={form.title_line_2} onChange={(e) => setForm({ ...form, title_line_2: e.target.value.toUpperCase() })} />
                </div>
                <div>
                  <Label>Linha 3 do título</Label>
                  <Input value={form.title_line_3} onChange={(e) => setForm({ ...form, title_line_3: e.target.value.toUpperCase() })} />
                </div>
              </div>

              <div>
                <Label>Subtítulo/base legal</Label>
                <Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="Ex.: Lei nº 8.112/90" />
              </div>

              <div>
                <Label>Texto do selo</Label>
                <Textarea rows={2} value={form.badge_text} onChange={(e) => setForm({ ...form, badge_text: e.target.value.toUpperCase() })} />
              </div>

              <div>
                <Label>Frase motivacional</Label>
                <Textarea rows={2} value={form.quote_text} onChange={(e) => setForm({ ...form, quote_text: e.target.value })} />
              </div>

              <div className="flex gap-2">
                <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()} className="bg-primary hover:bg-primary/90 flex-1">
                  <Plus className="h-4 w-4 mr-2" /> {editingId ? "Salvar alterações" : "Cadastrar capa"}
                </Button>
                {editingId && <Button variant="outline" onClick={cancelEdit}><X className="h-4 w-4 mr-2" />Cancelar</Button>}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h2 className="text-xl font-bold text-primary">Prévia</h2>
            <CoverPreview cover={form} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-primary">Capas cadastradas</h2>
            <span className="text-sm text-muted-foreground">{covers.data?.length ?? 0} capa(s)</span>
          </div>

          {covers.data?.length === 0 && <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhuma capa cadastrada.</CardContent></Card>}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {covers.data?.map((c: any) => (
              <Card key={c.id} className="overflow-hidden">
                <div className="scale-[0.62] origin-top-left w-[161.3%] -mb-[240px] pointer-events-none">
                  <CoverPreview cover={c} compact />
                </div>
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <div className="font-bold text-primary">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.themes?.name || "Sem tema vinculado"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{c.subtitle || "Sem subtítulo"}</Badge>
                    {c.is_active && <Badge className="bg-secondary text-secondary-foreground">Ativa</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => editCover(c)}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
                    <Button size="sm" variant="outline" onClick={() => duplicateCover(c)}><Copy className="h-4 w-4 mr-1" />Duplicar</Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir esta capa?")) del.mutate(c.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function CoverPreview({ cover, compact = false }: { cover: Partial<CoverForm> | any; compact?: boolean }) {
  const line1 = cover.title_line_1 || "ESTATUTO DO";
  const line2 = cover.title_line_2 || "SERVIDOR PÚBLICO";
  const line3 = cover.title_line_3 || "FEDERAL";
  const subtitle = cover.subtitle || "Lei nº 8.112/90";
  const badge = cover.badge_text || "MENOS TEORIA, MAIS RESULTADO!";
  const quote = cover.quote_text || "Seu esforço hoje, sua conquista amanhã!";

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-[#041b3f] text-white shadow-xl ${compact ? "h-[760px]" : "h-[820px]"}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(30,80,140,.75),transparent_45%),linear-gradient(180deg,#031633_0%,#06204c_55%,#020b1d_100%)]" />
      <div className="absolute inset-x-0 top-[145px] h-1 bg-[#ffc400]" />
      <div className="absolute top-[145px] left-1/2 -translate-x-1/2 w-16 h-6 bg-[#ffc400] [clip-path:polygon(0_0,100%_0,50%_100%)]" />

      <div className="relative z-10 px-8 pt-6 text-center">
        <div className="text-5xl leading-none">☑</div>
        <div className="text-4xl font-black tracking-wide mt-1">QUESTÃO DE SUCESSO</div>
        <div className="text-[#ffc400] font-bold tracking-wide text-sm mt-1">QUESTÕES COMENTADAS PARA CONCURSOS</div>
      </div>

      <div className="relative z-10 mt-14 px-8 text-center uppercase">
        <div className="text-6xl md:text-7xl font-black tracking-tight leading-[.95] text-white drop-shadow">{line1}</div>
        <div className="text-5xl md:text-6xl font-black tracking-tight leading-[.95] text-[#ffc400] drop-shadow mt-2">{line2}</div>
        <div className="text-6xl md:text-7xl font-black tracking-tight leading-[.95] text-white drop-shadow mt-2">{line3}</div>
        <div className="inline-block mt-5 rounded-xl border-2 border-[#ffc400] px-8 py-2 text-3xl font-black text-[#ffc400] normal-case">{subtitle}</div>
        <div className="mt-4 font-bold text-lg">Estude por questões. Aprenda na prática. Seja aprovado.</div>
      </div>

      <div className="relative z-10 mt-8 grid grid-cols-[1fr_190px] gap-5 px-8">
        <div className="space-y-3 text-lg font-bold">
          {["Do zero à nomeação", "Comentários didáticos", "4 níveis de questões", "Foco no que importa"].map((item) => (
            <div key={item} className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#ffc400] text-[#ffc400]">★</div>
              <div>{item.split(" ").slice(0, -1).join(" ")} <span className="text-[#ffc400]">{item.split(" ").slice(-1)}</span></div>
            </div>
          ))}
        </div>
        <div className="flex h-44 w-44 items-center justify-center rounded-full bg-[#ffc400] p-5 text-center text-2xl font-black leading-tight text-[#031633] shadow-lg">{badge}</div>
      </div>

      <div className="relative z-10 mx-8 mt-7 rounded-lg border border-[#ffc400] bg-[#031633]/75 p-3">
        <div className="text-center text-lg font-black">4 NÍVEIS DE QUESTÕES</div>
        <div className="mt-3 grid grid-cols-4 gap-3 text-center">
          {[
            ["1", "NÍVEL 1", "CONTATO INICIAL"],
            ["2", "NÍVEL 2", "MEMORIZAÇÃO"],
            ["3", "NÍVEL 3", "RACIOCÍNIO"],
            ["4", "NÍVEL 4", "ANÁLISE"],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-lg border border-[#ffc400]/60 bg-[#06204c]/80 p-3">
              <div className="mx-auto -mt-7 mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#ffc400] text-xl font-black text-[#031633]">{n}</div>
              <div className="text-sm font-black text-[#ffc400]">{t}</div>
              <div className="text-xs font-bold">{d}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 mx-8 mt-4 rounded-lg border border-[#ffc400] p-3 text-center">
        <div className="text-2xl font-black">ESTUDE COM INTELIGÊNCIA.</div>
        <div className="text-4xl font-black text-[#ffc400]">SEJA O PRÓXIMO NOMEADO!</div>
      </div>

      <div className="absolute bottom-32 right-10 z-10 max-w-[260px] text-2xl font-black leading-tight"><span className="text-[#ffc400]">“</span> {quote}</div>
    </div>
  );
}
