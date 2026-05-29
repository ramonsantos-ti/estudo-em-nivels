import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, ImagePlus, Trash2, UploadCloud } from "lucide-react";
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
  isBuiltin?: boolean;
};

type TextLayerKey = "title" | "subtitle" | "tagline";

type TextLayerPosition = {
  x: number;
  y: number;
  width: number;
};

type TextLayerPositions = Record<TextLayerKey, TextLayerPosition>;

const DEFAULT_MODEL_IMAGE = makeDefaultCoverSvg();

const BUILTIN_MODEL: CoverModel = {
  id: "builtin-default-cover-model",
  name: "Modelo padrão — Questão de Sucesso",
  image_data_url: DEFAULT_MODEL_IMAGE,
  isBuiltin: true,
};

const DEFAULT_POSITIONS: TextLayerPositions = {
  title: { x: 9, y: 18, width: 82 },
  subtitle: { x: 22, y: 34, width: 56 },
  tagline: { x: 15, y: 40, width: 70 },
};

function CoversPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(BUILTIN_MODEL.id);
  const [titleLine1, setTitleLine1] = useState("ESTATUTO DO");
  const [titleLine2, setTitleLine2] = useState("SERVIDOR PÚBLICO");
  const [titleLine3, setTitleLine3] = useState("FEDERAL");
  const [subtitle, setSubtitle] = useState("Lei nº 8.112/90");
  const [tagline, setTagline] = useState("Estude por questões. Aprenda na prática. Seja aprovado.");
  const [positions, setPositions] = useState<TextLayerPositions>(DEFAULT_POSITIONS);
  const [dragging, setDragging] = useState<TextLayerKey | null>(null);

  const modelsQuery = useQuery({
    queryKey: ["cover-models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("covers")
        .select("id, name, image_data_url, created_at, is_active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CoverModel[];
    },
  });

  const models = useMemo(() => [BUILTIN_MODEL, ...(modelsQuery.data ?? [])], [modelsQuery.data]);
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? BUILTIN_MODEL;
  const selectedImage = selectedModel.image_data_url || DEFAULT_MODEL_IMAGE;

  const uploadModel = useMutation({
    mutationFn: async (file: File) => {
      const imageDataUrl = await fileToCompressedDataUrl(file);
      const name = file.name.replace(/\.[^.]+$/, "") || "Modelo de capa";
      const { error } = await supabase.from("covers").insert({
        name,
        image_data_url: imageDataUrl,
        title_line_1: "",
        title_line_2: "",
        title_line_3: "",
        subtitle: "",
        badge_text: "",
        quote_text: "",
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Modelo de capa cadastrado");
      qc.invalidateQueries({ queryKey: ["cover-models"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteModel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("covers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Modelo excluído");
      setSelectedModelId(BUILTIN_MODEL.id);
      qc.invalidateQueries({ queryKey: ["cover-models"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function handleUpload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem.");
      return;
    }
    uploadModel.mutate(file);
  }

  function beginDrag(layer: TextLayerKey) {
    setDragging(layer);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setPositions((current) => ({
      ...current,
      [dragging]: {
        ...current[dragging],
        x: clamp(x - current[dragging].width / 2, 0, 100 - current[dragging].width),
        y: clamp(y, 0, 95),
      },
    }));
  }

  function finishDrag() {
    setDragging(null);
  }

  async function exportPdf() {
    try {
      const canvas = await renderCoverToCanvas({
        imageDataUrl: selectedImage,
        titleLine1,
        titleLine2,
        titleLine3,
        subtitle,
        tagline,
        positions,
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
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-primary">Capas personalizadas</h1>
          <p className="text-muted-foreground">
            Cadastre modelos de capa, selecione uma imagem, posicione os textos sobre a área em branco e exporte a capa em PDF.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImagePlus className="h-5 w-5" /> Modelos de capa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleUpload(event.target.files?.[0])}
              />
              <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadModel.isPending}>
                <UploadCloud className="h-4 w-4 mr-2" /> {uploadModel.isPending ? "Enviando..." : "Adicionar modelo"}
              </Button>
              <p className="text-sm text-muted-foreground">
                A imagem enviada será salva como modelo. Os textos e posições do editor não ficam salvos.
              </p>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2">
              {models.map((model) => {
                const active = model.id === selectedModelId;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => setSelectedModelId(model.id)}
                    className={`relative min-w-[130px] rounded-lg border p-2 text-left transition ${active ? "border-secondary ring-2 ring-secondary" : "border-border hover:border-primary"}`}
                  >
                    <div className="aspect-[1055/1491] overflow-hidden rounded-md bg-muted">
                      <img src={model.image_data_url || DEFAULT_MODEL_IMAGE} alt={model.name} className="h-full w-full object-cover" />
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs font-medium text-primary">{model.name}</div>
                    {model.isBuiltin && <Badge className="mt-1 bg-secondary text-secondary-foreground">Padrão</Badge>}
                  </button>
                );
              })}
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
                Para mover os textos, arraste diretamente cada bloco sobre a imagem da direita.
              </div>

              <div className="flex gap-2">
                <Button type="button" onClick={exportPdf} className="bg-primary hover:bg-primary/90 flex-1">
                  <Download className="h-4 w-4 mr-2" /> Exportar PDF
                </Button>
                {!selectedModel.isBuiltin && (
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
              <CardTitle>Modelo selecionado</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                ref={previewRef}
                className="relative mx-auto aspect-[1055/1491] max-h-[82vh] overflow-hidden rounded-xl border bg-muted shadow-xl select-none"
                onPointerMove={handlePointerMove}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                onPointerLeave={finishDrag}
              >
                <img src={selectedImage} alt={selectedModel.name} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
                <DraggableText
                  layer="title"
                  position={positions.title}
                  onPointerDown={beginDrag}
                  className="text-center font-black uppercase leading-[0.95] text-white drop-shadow-[0_3px_4px_rgba(0,0,0,0.75)]"
                >
                  <div className="text-[clamp(22px,5.3vw,78px)]">{titleLine1}</div>
                  <div className="text-[clamp(22px,5.3vw,78px)] text-[#ffc400]">{titleLine2}</div>
                  <div className="text-[clamp(22px,5.3vw,78px)]">{titleLine3}</div>
                </DraggableText>
                <DraggableText
                  layer="subtitle"
                  position={positions.subtitle}
                  onPointerDown={beginDrag}
                  className="text-center"
                >
                  <span className="inline-block rounded-xl border-2 border-[#ffc400] bg-[#071a3a]/70 px-5 py-2 text-[clamp(14px,2.4vw,34px)] font-black text-[#ffc400] shadow">
                    {subtitle}
                  </span>
                </DraggableText>
                <DraggableText
                  layer="tagline"
                  position={positions.tagline}
                  onPointerDown={beginDrag}
                  className="text-center text-[clamp(12px,1.8vw,24px)] font-bold text-white drop-shadow"
                >
                  {tagline}
                </DraggableText>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function DraggableText({
  layer,
  position,
  onPointerDown,
  className,
  children,
}: {
  layer: TextLayerKey;
  position: TextLayerPosition;
  onPointerDown: (layer: TextLayerKey) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`absolute cursor-move rounded-md border border-dashed border-white/45 p-1 ${className ?? ""}`}
      style={{ left: `${position.x}%`, top: `${position.y}%`, width: `${position.width}%` }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onPointerDown(layer);
      }}
    >
      {children}
    </div>
  );
}

async function fileToCompressedDataUrl(file: File) {
  const source = await fileToDataUrl(file);
  const img = await loadImage(source);
  const maxW = 1200;
  const scale = Math.min(1, maxW / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
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
  positions: TextLayerPositions;
}) {
  const img = await loadImage(args.imageDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 1055;
  canvas.height = 1491;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível gerar o PDF.");

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  drawTitleBlock(ctx, args.positions.title, args.titleLine1, args.titleLine2, args.titleLine3);
  drawSubtitle(ctx, args.positions.subtitle, args.subtitle);
  drawTagline(ctx, args.positions.tagline, args.tagline);

  return canvas;
}

function drawTitleBlock(ctx: CanvasRenderingContext2D, pos: TextLayerPosition, line1: string, line2: string, line3: string) {
  const x = pct(pos.x, 1055) + pct(pos.width, 1055) / 2;
  const y = pct(pos.y, 1491);
  const maxWidth = pct(pos.width, 1055);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "900 84px Arial";
  ctx.lineWidth = 8;
  [
    [line1, "#ffffff", y],
    [line2, "#ffc400", y + 84],
    [line3, "#ffffff", y + 168],
  ].forEach(([text, color, top]) => {
    ctx.strokeStyle = "rgba(0,0,0,0.62)";
    ctx.fillStyle = String(color);
    ctx.strokeText(String(text), x, Number(top), maxWidth);
    ctx.fillText(String(text), x, Number(top), maxWidth);
  });
}

function drawSubtitle(ctx: CanvasRenderingContext2D, pos: TextLayerPosition, text: string) {
  const x = pct(pos.x, 1055) + pct(pos.width, 1055) / 2;
  const y = pct(pos.y, 1491);
  const maxWidth = pct(pos.width, 1055);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 44px Arial";
  const metrics = ctx.measureText(text);
  const w = Math.min(metrics.width + 70, maxWidth);
  const h = 76;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 16, "rgba(4,27,63,.68)", "#ffc400", 4);
  ctx.fillStyle = "#ffc400";
  ctx.fillText(text, x, y + 2, maxWidth - 30);
}

function drawTagline(ctx: CanvasRenderingContext2D, pos: TextLayerPosition, text: string) {
  const x = pct(pos.x, 1055) + pct(pos.width, 1055) / 2;
  const y = pct(pos.y, 1491);
  const maxWidth = pct(pos.width, 1055);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "700 30px Arial";
  ctx.lineWidth = 4;
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

function makeDefaultCoverSvg() {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1055" height="1491" viewBox="0 0 1055 1491">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#031633"/>
        <stop offset="0.55" stop-color="#052553"/>
        <stop offset="1" stop-color="#020a1a"/>
      </linearGradient>
      <radialGradient id="sun" cx="67%" cy="56%" r="38%">
        <stop offset="0" stop-color="#ffc658" stop-opacity=".95"/>
        <stop offset=".34" stop-color="#25517f" stop-opacity=".55"/>
        <stop offset="1" stop-color="#001533" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity=".55"/></filter>
    </defs>
    <rect width="1055" height="1491" fill="url(#bg)"/>
    <rect width="1055" height="1491" fill="url(#sun)"/>
    <path d="M0 198 H500 L528 219 L556 198 H1055" fill="none" stroke="#ffc400" stroke-width="6"/>
    <g text-anchor="middle" font-family="Arial, sans-serif" filter="url(#shadow)">
      <text x="527" y="78" font-size="78" fill="#fff">☑</text>
      <text x="527" y="144" font-size="52" font-weight="900" fill="#fff">QUESTÃO DE SUCESSO</text>
      <text x="527" y="178" font-size="18" font-weight="900" fill="#ffc400">QUESTÕES COMENTADAS PARA CONCURSOS</text>
    </g>
    <g opacity=".88">
      <rect x="70" y="708" width="80" height="80" rx="40" fill="none" stroke="#ffc400" stroke-width="4"/>
      <text x="110" y="763" text-anchor="middle" font-size="52" fill="#ffc400">◎</text>
      <text x="164" y="738" font-family="Arial" font-size="26" font-weight="800" fill="#fff">Do zero à</text>
      <text x="164" y="770" font-family="Arial" font-size="26" font-weight="800" fill="#ffc400">nomeação</text>
      <rect x="70" y="808" width="80" height="80" rx="40" fill="none" stroke="#ffc400" stroke-width="4"/>
      <text x="110" y="860" text-anchor="middle" font-size="44" fill="#fff">▤</text>
      <text x="164" y="836" font-family="Arial" font-size="26" font-weight="800" fill="#fff">Comentários</text>
      <text x="164" y="868" font-family="Arial" font-size="26" font-weight="800" fill="#ffc400">didáticos</text>
      <rect x="70" y="908" width="80" height="80" rx="40" fill="none" stroke="#ffc400" stroke-width="4"/>
      <text x="110" y="958" text-anchor="middle" font-size="44" fill="#fff">↗</text>
      <text x="164" y="936" font-family="Arial" font-size="26" font-weight="800" fill="#fff">4 níveis de</text>
      <text x="164" y="968" font-family="Arial" font-size="26" font-weight="800" fill="#ffc400">questões</text>
      <rect x="70" y="1008" width="80" height="80" rx="40" fill="none" stroke="#ffc400" stroke-width="4"/>
      <text x="110" y="1060" text-anchor="middle" font-size="44" fill="#fff">♕</text>
      <text x="164" y="1036" font-family="Arial" font-size="26" font-weight="800" fill="#fff">Foco no que</text>
      <text x="164" y="1068" font-family="Arial" font-size="26" font-weight="800" fill="#ffc400">importa</text>
    </g>
    <g opacity=".95">
      <circle cx="870" cy="845" r="105" fill="#ffc400" stroke="#d69a00" stroke-width="6"/>
      <text x="870" y="805" text-anchor="middle" font-family="Arial" font-size="24" font-weight="900" fill="#031633">MENOS</text>
      <text x="870" y="842" text-anchor="middle" font-family="Arial" font-size="40" font-weight="900" fill="#031633">TEORIA,</text>
      <text x="870" y="884" text-anchor="middle" font-family="Arial" font-size="40" font-weight="900" fill="#031633">MAIS</text>
      <text x="870" y="920" text-anchor="middle" font-family="Arial" font-size="28" font-weight="900" fill="#031633">RESULTADO!</text>
    </g>
    <g font-family="Arial" font-weight="900" fill="#fff" filter="url(#shadow)">
      <text x="760" y="1018" font-size="28">“ Seu esforço hoje,</text>
      <text x="760" y="1054" font-size="28" fill="#ffc400">sua conquista</text>
      <text x="760" y="1090" font-size="28" fill="#ffc400">amanhã!</text>
    </g>
    <path d="M430 615 C520 505 700 525 795 640" fill="none" stroke="#ffcf72" stroke-width="18" opacity=".35"/>
    <rect x="366" y="713" width="150" height="400" rx="40" fill="#111827" opacity=".65"/>
    <circle cx="440" cy="650" r="45" fill="#191919" opacity=".75"/>
    <path d="M505 740 C590 690 660 640 720 595" stroke="#141414" stroke-width="42" stroke-linecap="round" fill="none" opacity=".85"/>
    <rect x="340" y="800" width="220" height="330" rx="30" fill="#12243f" opacity=".84"/>
    <path d="M300 880 H1040 V1145 H300 Z" fill="#031633" opacity=".55"/>
    <rect x="40" y="1150" width="975" height="225" rx="18" fill="#031633" stroke="#ffc400" stroke-width="3" opacity=".88"/>
    <text x="527" y="1184" text-anchor="middle" font-family="Arial" font-size="26" font-weight="900" fill="#fff">4 NÍVEIS DE QUESTÕES</text>
    <g font-family="Arial" font-weight="900">
      <rect x="55" y="1188" width="220" height="155" rx="16" fill="#06204c" stroke="#61b238"/>
      <circle cx="155" cy="1188" r="22" fill="#61b238"/><text x="155" y="1198" text-anchor="middle" font-size="26" fill="#fff">1</text>
      <text x="105" y="1248" font-size="22" fill="#75d143">NÍVEL 1 –</text><text x="105" y="1278" font-size="17" fill="#75d143">CONTATO INICIAL</text><text x="76" y="1332" font-size="18" fill="#fff">Questões simples.</text>
      <rect x="300" y="1188" width="220" height="155" rx="16" fill="#06204c" stroke="#36a8ff"/>
      <circle cx="400" cy="1188" r="22" fill="#36a8ff"/><text x="400" y="1198" text-anchor="middle" font-size="26" fill="#fff">2</text>
      <text x="350" y="1248" font-size="22" fill="#36a8ff">NÍVEL 2 –</text><text x="350" y="1278" font-size="17" fill="#36a8ff">MEMORIZAÇÃO</text><text x="322" y="1332" font-size="18" fill="#fff">Conceitos essenciais.</text>
      <rect x="545" y="1188" width="220" height="155" rx="16" fill="#06204c" stroke="#b56bff"/>
      <circle cx="645" cy="1188" r="22" fill="#8b4bdd"/><text x="645" y="1198" text-anchor="middle" font-size="26" fill="#fff">3</text>
      <text x="595" y="1248" font-size="22" fill="#c992ff">NÍVEL 3 –</text><text x="595" y="1278" font-size="17" fill="#c992ff">RACIOCÍNIO</text><text x="567" y="1332" font-size="18" fill="#fff">Interpretação e lógica.</text>
      <rect x="790" y="1188" width="220" height="155" rx="16" fill="#06204c" stroke="#ff9800"/>
      <circle cx="890" cy="1188" r="22" fill="#ff9800"/><text x="890" y="1198" text-anchor="middle" font-size="26" fill="#fff">4</text>
      <text x="840" y="1248" font-size="22" fill="#ff9800">NÍVEL 4 –</text><text x="840" y="1278" font-size="17" fill="#ff9800">ANÁLISE</text><text x="812" y="1332" font-size="18" fill="#fff">Pegadinhas e doutrina.</text>
    </g>
    <rect x="35" y="1385" width="985" height="82" rx="14" fill="#031633" stroke="#ffc400" stroke-width="3"/>
    <text x="527" y="1426" text-anchor="middle" font-family="Arial" font-size="34" font-weight="900" fill="#fff">ESTUDE COM INTELIGÊNCIA.</text>
    <text x="527" y="1460" text-anchor="middle" font-family="Arial" font-size="42" font-weight="900" fill="#ffc400">SEJA O PRÓXIMO NOMEADO!</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
