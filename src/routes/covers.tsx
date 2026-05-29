import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, ImagePlus, Save, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

export const Route = createFileRoute("/covers")({
  head: () => ({ meta: [{ title: "Capas — Questão de Sucesso" }] }),
  component: CoversPage,
});

type CoverModel = {
  id: string;
  name: string;
  image_data_url: string | null;
  created_at?: string;
};

type TextLayerKey = "title" | "subtitle" | "tagline";

type TextLayerBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TextLayerBoxes = Record<TextLayerKey, TextLayerBox>;

type Interaction = {
  layer: TextLayerKey;
  mode: "move" | "resize";
};

const COVER_MODELS_QUERY_KEY = ["cover-models"] as const;

const DEFAULT_BOXES: TextLayerBoxes = {
  title: { x: 8, y: 17, width: 84, height: 18 },
  subtitle: { x: 22, y: 35, width: 56, height: 6 },
  tagline: { x: 16, y: 42, width: 68, height: 5 },
};

function CoversPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState("");
  const [modelName, setModelName] = useState("");
  const [titleLine1, setTitleLine1] = useState("ESTATUTO DO");
  const [titleLine2, setTitleLine2] = useState("SERVIDOR PÚBLICO");
  const [titleLine3, setTitleLine3] = useState("FEDERAL");
  const [subtitle, setSubtitle] = useState("Lei nº 8.112/90");
  const [tagline, setTagline] = useState("Estude por questões. Aprenda na prática. Seja aprovado.");
  const [boxes, setBoxes] = useState<TextLayerBoxes>(DEFAULT_BOXES);
  const [interaction, setInteraction] = useState<Interaction | null>(null);

  const modelsQuery = useQuery({
    queryKey: COVER_MODELS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("covers")
        .select("id, name, image_data_url, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as CoverModel[]).filter((model) => Boolean(model.image_data_url));
    },
  });

  const models = modelsQuery.data ?? [];
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? models[0] ?? null,
    [models, selectedModelId],
  );
  const selectedImage = pendingImage || selectedModel?.image_data_url || null;

  const saveModel = useMutation({
    mutationFn: async () => {
      if (!pendingImage) throw new Error("Selecione uma imagem antes de salvar o modelo.");
      const name = modelName.trim() || pendingFileName || "Modelo de capa";
      const { data, error } = await supabase
        .from("covers")
        .insert({
          name,
          image_data_url: pendingImage,
          title_line_1: "",
          title_line_2: "",
          title_line_3: "",
          subtitle: "",
          badge_text: "",
          quote_text: "",
          is_active: true,
        })
        .select("id, name, image_data_url, created_at")
        .single();
      if (error) throw error;
      return data as CoverModel;
    },
    onSuccess: async (savedModel) => {
      qc.setQueryData<CoverModel[]>(COVER_MODELS_QUERY_KEY, (current = []) => {
        const withoutDuplicate = current.filter((model) => model.id !== savedModel.id);
        return [savedModel, ...withoutDuplicate].filter((model) => Boolean(model.image_data_url));
      });
      setSelectedModelId(savedModel.id);
      setPendingImage(null);
      setPendingFileName("");
      setModelName("");
      await qc.invalidateQueries({ queryKey: COVER_MODELS_QUERY_KEY });
      toast.success("Modelo salvo e adicionado ao carrossel");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteModel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("covers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, deletedId) => {
      qc.setQueryData<CoverModel[]>(COVER_MODELS_QUERY_KEY, (current = []) => current.filter((model) => model.id !== deletedId));
      toast.success("Modelo excluído");
      setSelectedModelId(null);
      await qc.invalidateQueries({ queryKey: COVER_MODELS_QUERY_KEY });
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem.");
      return;
    }
    try {
      const imageDataUrl = await fileToCompressedDataUrl(file);
      const name = file.name.replace(/\.[^.]+$/, "") || "Modelo de capa";
      setPendingImage(imageDataUrl);
      setPendingFileName(name);
      setModelName(name);
      setSelectedModelId(null);
      toast.success("Imagem carregada. Clique em Salvar modelo para gravar.");
    } catch (e: any) {
      toast.error(e.message || "Não foi possível carregar a imagem.");
    }
  }

  function selectSavedModel(model: CoverModel) {
    setPendingImage(null);
    setPendingFileName("");
    setModelName("");
    setSelectedModelId(model.id);
  }

  function beginInteraction(layer: TextLayerKey, mode: "move" | "resize") {
    setInteraction({ layer, mode });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!interaction || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100;

    setBoxes((current) => {
      const box = current[interaction.layer];
      if (interaction.mode === "resize") {
        return {
          ...current,
          [interaction.layer]: {
            ...box,
            width: clamp(pointerX - box.x, 12, 100 - box.x),
            height: clamp(pointerY - box.y, 3, 100 - box.y),
          },
        };
      }

      return {
        ...current,
        [interaction.layer]: {
          ...box,
          x: clamp(pointerX - box.width / 2, 0, 100 - box.width),
          y: clamp(pointerY - box.height / 2, 0, 100 - box.height),
        },
      };
    });
  }

  function finishInteraction() {
    setInteraction(null);
  }

  async function exportPdf() {
    if (!selectedImage) {
      toast.error("Selecione ou salve um modelo antes de exportar.");
      return;
    }

    try {
      const canvas = await renderCoverToCanvas({
        imageDataUrl: selectedImage,
        titleLine1,
        titleLine2,
        titleLine3,
        subtitle,
        tagline,
        boxes,
      });
      const img = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pdf.addImage(img, "JPEG", 0, 0, pageW, pageH, undefined, "FAST");
      pdf.save(`${slug([titleLine1, titleLine2, titleLine3].filter(Boolean).join(" ") || "capa")}.pdf`);
      toast.success("Capa exportada em PDF");
    } catch (e: any) {
      toast.error(e.message || "Não foi possível exportar a capa.");
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">Capas personalizadas</h1>
          <p className="text-muted-foreground">
            Envie imagens de fundo como modelos de capa. Depois selecione um modelo, preencha os textos, mova/redimensione as caixas e exporte em PDF.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ImagePlus className="h-5 w-5" /> Upload e modelos salvos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-end">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleUpload(event.target.files?.[0])}
                />
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <UploadCloud className="h-4 w-4 mr-2" /> Escolher imagem
                </Button>
              </div>
              <div>
                <Label>Nome do modelo</Label>
                <Input
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="Informe um nome antes de salvar"
                  disabled={!pendingImage}
                />
              </div>
              <Button type="button" onClick={() => saveModel.mutate()} disabled={!pendingImage || saveModel.isPending}>
                <Save className="h-4 w-4 mr-2" /> {saveModel.isPending ? "Salvando..." : "Salvar modelo"}
              </Button>
            </div>

            {pendingImage && (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 p-2 text-sm">
                <span>Imagem carregada aguardando salvamento: <strong>{modelName || pendingFileName}</strong></span>
                <Button size="sm" variant="ghost" onClick={() => { setPendingImage(null); setPendingFileName(""); setModelName(""); }}>
                  <X className="h-4 w-4 mr-1" />Cancelar
                </Button>
              </div>
            )}

            <div className="max-h-[28vh] overflow-x-auto rounded-md border bg-muted/20 p-2">
              <div className="flex gap-2">
                {models.map((model) => {
                  const active = !pendingImage && model.id === selectedModel?.id;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => selectSavedModel(model)}
                      className={`w-24 shrink-0 rounded-md border p-1 text-left transition ${active ? "border-secondary ring-2 ring-secondary" : "border-border hover:border-primary"}`}
                    >
                      <div className="aspect-[1055/1491] overflow-hidden rounded bg-muted">
                        <img src={model.image_data_url || ""} alt={model.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="mt-1 line-clamp-2 text-[11px] font-medium text-primary">{model.name}</div>
                    </button>
                  );
                })}
                {models.length === 0 && !pendingImage && (
                  <div className="py-6 text-sm text-muted-foreground">Nenhum modelo salvo. Escolha uma imagem e clique em Salvar modelo.</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader className="bg-primary text-primary-foreground">
              <CardTitle>Informações da capa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div>
                <Label>Linha 1 do título</Label>
                <Input value={titleLine1} onChange={(e) => setTitleLine1(e.target.value.toUpperCase())} />
              </div>
              <div>
                <Label>Linha 2 do título</Label>
                <Input value={titleLine2} onChange={(e) => setTitleLine2(e.target.value.toUpperCase())} />
              </div>
              <div>
                <Label>Linha 3 do título</Label>
                <Input value={titleLine3} onChange={(e) => setTitleLine3(e.target.value.toUpperCase())} />
              </div>
              <div>
                <Label>Subtítulo/base legal</Label>
                <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
              </div>
              <div>
                <Label>Frase complementar</Label>
                <Input value={tagline} onChange={(e) => setTagline(e.target.value)} />
              </div>

              <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                Arraste a caixa para mover. Arraste o quadrado no canto inferior direito da caixa para redimensionar.
              </div>

              <div className="flex gap-2">
                <Button type="button" onClick={exportPdf} disabled={!selectedImage} className="bg-primary hover:bg-primary/90 flex-1">
                  <Download className="h-4 w-4 mr-2" /> Exportar PDF
                </Button>
                {!pendingImage && selectedModel && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (confirm("Excluir este modelo de capa?")) deleteModel.mutate(selectedModel.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {pendingImage ? "Prévia da imagem ainda não salva" : selectedModel ? "Modelo selecionado" : "Nenhum modelo selecionado"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedImage ? (
                <div
                  ref={previewRef}
                  className="relative mx-auto aspect-[1055/1491] max-h-[82vh] overflow-hidden rounded-xl border bg-muted shadow-xl select-none"
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishInteraction}
                  onPointerCancel={finishInteraction}
                  onPointerLeave={finishInteraction}
                >
                  <img src={selectedImage} alt="Modelo de capa" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
                  <EditableBox
                    layer="title"
                    box={boxes.title}
                    onStart={beginInteraction}
                    className="text-center font-black uppercase leading-[0.95] text-white drop-shadow-[0_3px_4px_rgba(0,0,0,0.75)]"
                  >
                    <div className="text-[clamp(22px,5.3vw,78px)]">{titleLine1}</div>
                    <div className="text-[clamp(22px,5.3vw,78px)] text-[#ffc400]">{titleLine2}</div>
                    <div className="text-[clamp(22px,5.3vw,78px)]">{titleLine3}</div>
                  </EditableBox>
                  <EditableBox layer="subtitle" box={boxes.subtitle} onStart={beginInteraction} className="text-center">
                    <span className="inline-block rounded-xl border-2 border-[#ffc400] bg-[#071a3a]/70 px-5 py-2 text-[clamp(14px,2.4vw,34px)] font-black text-[#ffc400] shadow">
                      {subtitle}
                    </span>
                  </EditableBox>
                  <EditableBox
                    layer="tagline"
                    box={boxes.tagline}
                    onStart={beginInteraction}
                    className="text-center text-[clamp(12px,1.8vw,24px)] font-bold text-white drop-shadow"
                  >
                    {tagline}
                  </EditableBox>
                </div>
              ) : (
                <div className="flex aspect-[1055/1491] max-h-[82vh] items-center justify-center rounded-xl border bg-muted text-center text-muted-foreground">
                  Faça upload e salve um modelo para começar.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function EditableBox({
  layer,
  box,
  onStart,
  className,
  children,
}: {
  layer: TextLayerKey;
  box: TextLayerBox;
  onStart: (layer: TextLayerKey, mode: "move" | "resize") => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`absolute cursor-move rounded-md border border-dashed border-white/60 p-1 ${className ?? ""}`}
      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onStart(layer, "move");
      }}
    >
      <div className="flex h-full w-full items-center justify-center overflow-hidden">{children}</div>
      <button
        type="button"
        aria-label="Redimensionar caixa"
        className="absolute bottom-0 right-0 h-4 w-4 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-sm border border-white bg-secondary"
        onPointerDown={(event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          onStart(layer, "resize");
        }}
      />
    </div>
  );
}

async function fileToCompressedDataUrl(file: File) {
  const source = await fileToDataUrl(file);
  const img = await loadImage(source);
  const maxW = 1400;
  const scale = Math.min(1, maxW / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    img.src = src;
  });
}

async function renderCoverToCanvas(args: {
  imageDataUrl: string;
  titleLine1: string;
  titleLine2: string;
  titleLine3: string;
  subtitle: string;
  tagline: string;
  boxes: TextLayerBoxes;
}) {
  const img = await loadImage(args.imageDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 1055;
  canvas.height = 1491;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível gerar o PDF.");

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawTitleBlock(ctx, args.boxes.title, args.titleLine1, args.titleLine2, args.titleLine3);
  drawSubtitle(ctx, args.boxes.subtitle, args.subtitle);
  drawTagline(ctx, args.boxes.tagline, args.tagline);

  return canvas;
}

function drawTitleBlock(ctx: CanvasRenderingContext2D, box: TextLayerBox, line1: string, line2: string, line3: string) {
  const x = pct(box.x, 1055) + pct(box.width, 1055) / 2;
  const y = pct(box.y, 1491);
  const maxWidth = pct(box.width, 1055);
  const lineHeight = pct(box.height, 1491) / 3;
  const fontSize = Math.max(24, Math.min(92, lineHeight * 0.88));
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `900 ${fontSize}px Arial`;
  ctx.lineWidth = Math.max(4, fontSize * 0.08);
  [
    [line1, "#ffffff", y],
    [line2, "#ffc400", y + lineHeight],
    [line3, "#ffffff", y + lineHeight * 2],
  ].forEach(([text, color, top]) => {
    ctx.strokeStyle = "rgba(0,0,0,0.62)";
    ctx.fillStyle = String(color);
    ctx.strokeText(String(text), x, Number(top), maxWidth);
    ctx.fillText(String(text), x, Number(top), maxWidth);
  });
}

function drawSubtitle(ctx: CanvasRenderingContext2D, box: TextLayerBox, text: string) {
  const x = pct(box.x, 1055) + pct(box.width, 1055) / 2;
  const y = pct(box.y, 1491) + pct(box.height, 1491) / 2;
  const maxWidth = pct(box.width, 1055);
  const h = pct(box.height, 1491);
  const fontSize = Math.max(18, Math.min(54, h * 0.55));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${fontSize}px Arial`;
  roundRect(ctx, pct(box.x, 1055), pct(box.y, 1491), maxWidth, h, 16, "rgba(4,27,63,.68)", "#ffc400", 4);
  ctx.fillStyle = "#ffc400";
  ctx.fillText(text, x, y + 2, maxWidth - 30);
}

function drawTagline(ctx: CanvasRenderingContext2D, box: TextLayerBox, text: string) {
  const x = pct(box.x, 1055) + pct(box.width, 1055) / 2;
  const y = pct(box.y, 1491) + pct(box.height, 1491) / 2;
  const maxWidth = pct(box.width, 1055);
  const fontSize = Math.max(14, Math.min(36, pct(box.height, 1491) * 0.62));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${fontSize}px Arial`;
  ctx.lineWidth = Math.max(2, fontSize * 0.08);
  ctx.strokeStyle = "rgba(0,0,0,.55)";
  ctx.fillStyle = "#ffffff";
  ctx.strokeText(text, x, y, maxWidth);
  ctx.fillText(text, x, y, maxWidth);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke: string,
  lineWidth: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function pct(value: number, total: number) {
  return (value / 100) * total;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "capa";
}
