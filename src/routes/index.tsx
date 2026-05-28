import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, BookOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Temas — Questão de Sucesso" }] }),
  component: ThemesPage,
});

function ThemesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const themes = useQuery({
    queryKey: ["themes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("themes")
        .select("*, subthemes(*), questions(id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addTheme = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("themes").insert({ name, description: desc || null });
      if (error) throw error;
    },
    onSuccess: () => {
      setName(""); setDesc("");
      qc.invalidateQueries({ queryKey: ["themes"] });
      toast.success("Tema criado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delTheme = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("themes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["themes"] }),
  });

  return (
    <AppShell>
      <div className="grid gap-8 md:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Novo tema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Nome do tema (ex.: Direito Constitucional)" value={name} onChange={(e) => setName(e.target.value)} />
            <Textarea placeholder="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <Button
              className="w-full bg-primary hover:bg-primary/90"
              disabled={!name.trim() || addTheme.isPending}
              onClick={() => addTheme.mutate()}
            >
              <Plus className="h-4 w-4 mr-2" /> Adicionar
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-primary">Temas cadastrados</h2>
          {themes.isLoading && <p className="text-muted-foreground">Carregando...</p>}
          {themes.data?.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum tema ainda. Crie o primeiro!</CardContent></Card>
          )}
          {themes.data?.map((t: any) => (
            <Card key={t.id} className="border-l-4 border-l-secondary">
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-bold text-primary">{t.name}</h3>
                  </div>
                  {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{t.subthemes?.length ?? 0} subtemas</span>
                    <span>{t.questions?.length ?? 0} questões</span>
                  </div>
                  <SubthemeManager themeId={t.id} subthemes={t.subthemes ?? []} />
                </div>
                <div className="flex flex-col gap-2">
                  <Link to="/questions" search={{ themeId: t.id } as any}>
                    <Button size="sm" variant="outline">Questões</Button>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir tema e todas as questões?")) delTheme.mutate(t.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function SubthemeManager({ themeId, subthemes }: { themeId: string; subthemes: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("subthemes").insert({ theme_id: themeId, name });
      if (error) throw error;
    },
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: ["themes"] }); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subthemes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["themes"] }),
  });
  return (
    <div className="mt-3">
      <button className="text-xs font-medium text-primary underline" onClick={() => setOpen(!open)}>
        {open ? "Ocultar subtemas" : "Gerenciar subtemas"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 bg-muted/40 p-3 rounded-md">
          {subthemes.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span>• {s.name}</span>
              <button onClick={() => del.mutate(s.id)} className="text-destructive text-xs">remover</button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input placeholder="Novo subtema" value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
            <Button size="sm" disabled={!name.trim()} onClick={() => add.mutate()} className="bg-primary hover:bg-primary/90">+</Button>
          </div>
        </div>
      )}
    </div>
  );
}
