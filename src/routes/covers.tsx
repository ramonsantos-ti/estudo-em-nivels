import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download, Plus, Save, Trash2, Type, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

export const Route = createFileRoute("/covers")({
  head: () => ({ meta: [{ title: "Capas — Questão de Sucesso" }] }),
  component: CoversPage,
});

type CoverModel = { id: string; name: string; image_data_url: string; created_at?: string };
type TextAlign = "left" | "center" | "right";
type TextBlock = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  backgroundColor: string;
  backgroundOpacity: number;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  padding: number;
  lineHeight: number;
  uppercase: boolean;
};
type Interaction = { blockId: string; mode: "move" | "resize" };

const COVER_MODELS_QUERY_KEY = ["cover-models"] as const;
const EXPORT_CANVAS_WIDTH = 1055;
const EXPORT_CANVAS_HEIGHT = 1491;

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function createBlock(overrides: Partial<TextBlock> = {}): TextBlock {
  return {
    id: createId(),
    text: "Novo bloco de texto",
    x: 18,
    y: 18,
    width: 60,
    height: 10,
    fontSize: 42,
    color: "#ffffff",
    bold: true,
    italic: false,
    align: "center",
    backgroundColor: "#071a3a",
    backgroundOpacity: 0,
    borderColor: "#ffc400",
    borderWidth: 0,
    borderRadius: 10,
    padding: 8,
    lineHeight: 1.1,
    uppercase: false,
    ...overrides,
  };
}

const INITIAL_BLOCKS: TextBlock[] = [
  createBlock({
    text: "ESTATUTO DO\nSERVIDOR PÚBLICO\nFEDERAL",
    x: 10,
    y: 18,
    width: 80,
    height: 18,
    fontSize: 58,
    lineHeight: 0.95,
    uppercase: true,
  }),
  createBlock({
    text: "Lei nº 8.112/90",
    x: 24,
    y: 37,
    width: 52,
    height: 6,
    fontSize: 28,
    color: "#ffc400",
    backgroundOpacity: 0.65,
    borderWidth: 2,
    borderRadius: 14,
    padding: 10,
  }),
];

function CoversPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState("");
  const [modelName, setModelName] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<TextBlock[]>(INITIAL_BLOCKS);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(INITIAL_BLOCKS[0]?.id ?? null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [previewScale, setPreviewScale] = useState(1);

  const modelsQuery = useQuery({
    queryKey: COVER_MODELS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cover_models")
        .select("id, name, image_data_url, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as CoverModel[]).filter((model) => Boolean(model.image_data_url));
    },
  });

  const models = modelsQuery.data ?? [];
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );
  const selectedImage = pendingImage || selectedModel?.image_data_url || null;
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? null;

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;

    const updateScale = () => {
      const width = node.getBoundingClientRect().width;
      setPreviewScale(width > 0 ? width / EXPORT_CANVAS_WIDTH : 1);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    window.addEventListener("resize", updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [selectedImage]);

  const saveModel = useMutation({
    mutationFn: async () => {
      if (!pendingImage) throw new Error("Selecione uma imagem antes de salvar o modelo.");
      const name = modelName.trim() || pendingFileName || "Modelo de capa";
      const { data, error } = await (supabase as any)
        .from("cover_models")
        .insert({ name, image_data_url: pendingImage })
        .select("id, name, image_data_url, created_at")
        .single();
      if (error) throw error;
      return data as CoverModel;
    },
    onSuccess: async (savedModel) => {
      qc.setQueryData<CoverModel[]>(COVER_MODELS_QUERY_KEY, (current = []) => {
        const withoutDuplicate = current.filter((model) => model.id !== savedModel.id);
        return [savedModel, ...withoutDuplicate];
      });
      setSelectedModelId(savedModel.id);
      setPendingImage(null);
      setPendingFileName("");
      setModelName("");
      await qc.invalidateQueries({ queryKey: COVER_MODELS_QUERY_KEY });
      toast.success("Modelo salvo e adicionado ao carrossel");
    },
    onError: (e: any) => toast.error(`Erro ao salvar modelo: ${e.message}`),
  });

  const deleteModel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("cover_models").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, deletedId) => {
      qc.setQueryData<CoverModel[]>(COVER_MODELS_QUERY_KEY, (current = []) => current.filter((model) => model.id !== deletedId));
      setSelectedModelId(null);
      await qc.invalidateQueries({ queryKey: COVER_MODELS_QUERY_KEY });
      toast.success("Modelo excluído");
    },
    onError: (e: any) => toast.error(`Erro ao excluir modelo: ${e.message}`),
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

  function confirmDeleteSelectedModel() {
    if (!selectedModel) return;
    const ok = confirm(`Excluir o modelo de capa "${selectedModel.name}"? Essa ação não pode ser desfeita.`);
    if (!ok) return;
    deleteModel.mutate(selectedModel.id);
  }

  function addBlock() {
    const block = createBlock();
    setBlocks((current) => [...current, block]);
    setSelectedBlockId(block.id);
  }

  function duplicateBlock() {
    if (!selectedBlock) return;
    const clone = createBlock({
      ...selectedBlock,
      id: createId(),
      x: clamp(selectedBlock.x + 2, 0, 100 - selectedBlock.width),
      y: clamp(selectedBlock.y + 2, 0, 100 - selectedBlock.height),
    });
    setBlocks((current) => [...current, clone]);
    setSelectedBlockId(clone.id);
  }

  function removeBlock() {
    if (!selectedBlockId) return;
    const next = blocks.filter((block) => block.id !== selectedBlockId);
    setBlocks(next);
    setSelectedBlockId(next[0]?.id ?? null);
  }

  function updateSelectedBlock(patch: Partial<TextBlock>) {
    if (!selectedBlockId) return;
    setBlocks((current) => current.map((block) => (block.id === selectedBlockId ? { ...block, ...patch } : block)));
  }

  function beginInteraction(blockId: string, mode: "move" | "resize") {
    setSelectedBlockId(blockId);
    setInteraction({ blockId, mode });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!interaction || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100;

    setBlocks((current) => current.map((block) => {
      if (block.id !== interaction.blockId) return block;
      if (interaction.mode === "resize") {
        return {
          ...block,
          width: clamp(pointerX - block.x, 8, 100 - block.x),
          height: clamp(pointerY - block.y, 3, 100 - block.y),
        };
      }
      return {
        ...block,
        x: clamp(pointerX - block.width / 2, 0, 100 - block.width),
        y: clamp(pointerY - block.height / 2, 0, 100 - block.height),
      };
    }));
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
      const canvas = await renderCoverToCanvas({ imageDataUrl: selectedImage, blocks });
      const img = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pdf.addImage(img, "JPEG", 0, 0, pageW, pageH, undefined, "FAST");
      pdf.save(`${slug(selectedModel?.name || "capa")}.pdf`);
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
            Envie imagens de fundo como modelos. Depois escreva diretamente sobre a imagem, com quantos blocos de texto quiser.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Upload e modelos salvos</CardTitle>
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

            {modelsQuery.isError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                Erro ao carregar modelos: {(modelsQuery.error as any)?.message ?? "erro desconhecido"}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
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
                          <img src={model.image_data_url} alt={model.name} className="h-full w-full object-cover" />
                        </div>
                        <div className="mt-1 line-clamp-2 text-[11px] font-medium text-primary">{model.name}</div>
                      </button>
                    );
                  })}
                  {models.length === 0 && !pendingImage && !modelsQuery.isLoading && (
                    <div className="py-6 text-sm text-muted-foreground">Nenhum modelo salvo. Escolha uma imagem e clique em Salvar modelo.</div>
                  )}
                  {modelsQuery.isLoading && <div className="py-6 text-sm text-muted-foreground">Carregando modelos...</div>}
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                disabled={!selectedModel || Boolean(pendingImage) || deleteModel.isPending}
                onClick={confirmDeleteSelectedModel}
                className="md:mt-0"
                title={!selectedModel ? "Selecione um modelo no carrossel para excluir" : `Excluir ${selectedModel.name}`}
              >
                <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                {deleteModel.isPending ? "Excluindo..." : "Excluir modelo"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader className="bg-primary text-primary-foreground">
              <CardTitle>Painel do bloco selecionado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex gap-2">
                <Button type="button" onClick={addBlock} className="flex-1">
                  <Plus className="h-4 w-4 mr-2" /> Adicionar bloco
                </Button>
                <Button type="button" variant="outline" onClick={duplicateBlock} disabled={!selectedBlock}>
                  <Copy className="h-4 w-4 mr-2" /> Duplicar
                </Button>
                <Button type="button" variant="outline" onClick={removeBlock} disabled={!selectedBlock}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              {!selectedBlock && <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">Selecione um bloco na imagem ou crie um novo.</div>}

              {selectedBlock && (
                <>
                  <div>
                    <Label>Texto</Label>
                    <Textarea rows={5} value={selectedBlock.text} onChange={(e) => updateSelectedBlock({ text: e.target.value })} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FieldNumber label="Fonte" value={selectedBlock.fontSize} onChange={(v) => updateSelectedBlock({ fontSize: v })} />
                    <FieldColor label="Cor do texto" value={selectedBlock.color} onChange={(v) => updateSelectedBlock({ color: v })} />
                    <FieldColor label="Cor do fundo" value={selectedBlock.backgroundColor} onChange={(v) => updateSelectedBlock({ backgroundColor: v })} />
                    <FieldNumber label="Opacidade fundo" value={selectedBlock.backgroundOpacity} step={0.05} min={0} max={1} onChange={(v) => updateSelectedBlock({ backgroundOpacity: clamp(v, 0, 1) })} />
                    <FieldColor label="Cor da borda" value={selectedBlock.borderColor} onChange={(v) => updateSelectedBlock({ borderColor: v })} />
                    <FieldNumber label="Borda" value={selectedBlock.borderWidth} min={0} onChange={(v) => updateSelectedBlock({ borderWidth: v })} />
                    <FieldNumber label="Arredondamento" value={selectedBlock.borderRadius} min={0} onChange={(v) => updateSelectedBlock({ borderRadius: v })} />
                    <FieldNumber label="Padding" value={selectedBlock.padding} min={0} onChange={(v) => updateSelectedBlock({ padding: v })} />
                    <FieldNumber label="Entrelinhas" value={selectedBlock.lineHeight} step={0.05} min={0.7} onChange={(v) => updateSelectedBlock({ lineHeight: v })} />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(["left", "center", "right"] as TextAlign[]).map((align) => (
                      <Button key={align} type="button" variant={selectedBlock.align === align ? "default" : "outline"} onClick={() => updateSelectedBlock({ align })}>
                        {align === "left" ? "Esquerda" : align === "center" ? "Centro" : "Direita"}
                      </Button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Button type="button" variant={selectedBlock.bold ? "default" : "outline"} onClick={() => updateSelectedBlock({ bold: !selectedBlock.bold })}>Negrito</Button>
                    <Button type="button" variant={selectedBlock.italic ? "default" : "outline"} onClick={() => updateSelectedBlock({ italic: !selectedBlock.italic })}>Itálico</Button>
                    <Button type="button" variant={selectedBlock.uppercase ? "default" : "outline"} onClick={() => updateSelectedBlock({ uppercase: !selectedBlock.uppercase })}>Caixa alta</Button>
                  </div>
                </>
              )}

              <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                Clique em um bloco para selecioná-lo. Arraste o bloco para mover. Arraste o quadrado no canto inferior direito para redimensionar.
              </div>

              <Button type="button" onClick={exportPdf} disabled={!selectedImage} className="bg-primary hover:bg-primary/90 w-full">
                <Download className="h-4 w-4 mr-2" /> Exportar PDF
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Editor visual da capa</CardTitle>
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
                  <img src={selectedImage} alt="Modelo de capa" className="absolute inset-0 h-full w-full object-fill" draggable={false} />
                  {blocks.map((block) => (
                    <EditableTextBlock key={block.id} block={block} selected={block.id === selectedBlockId} scale={previewScale} onSelect={() => setSelectedBlockId(block.id)} onStart={beginInteraction} />
                  ))}
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

function EditableTextBlock({ block, selected, scale, onSelect, onStart }: { block: TextBlock; selected: boolean; scale: number; onSelect: () => void; onStart: (blockId: string, mode: "move" | "resize") => void }) {
  const scaledFontSize = block.fontSize * scale;
  const scaledPadding = block.padding * scale;
  const scaledBorderWidth = block.borderWidth * scale;
  const scaledBorderRadius = block.borderRadius * scale;
  const scaledStrokeWidth = Math.max(0.6, scaledFontSize * 0.06);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`absolute cursor-move overflow-visible ${selected ? "ring-2 ring-secondary" : ""}`}
      style={{ left: `${block.x}%`, top: `${block.y}%`, width: `${block.width}%`, height: `${block.height}%` }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelect();
        onStart(block.id, "move");
      }}
    >
      <div
        className="flex h-full w-full overflow-hidden"
        style={{
          backgroundColor: hexToRgba(block.backgroundColor, block.backgroundOpacity),
          border: `${scaledBorderWidth}px solid ${block.borderColor}`,
          borderRadius: `${scaledBorderRadius}px`,
          padding: `${scaledPadding}px`,
          alignItems: "center",
          justifyContent: block.align === "left" ? "flex-start" : block.align === "center" ? "center" : "flex-end",
          textAlign: block.align,
        }}
      >
        <div
          style={{
            width: "100%",
            color: block.color,
            fontFamily: "Arial, sans-serif",
            fontSize: `${scaledFontSize}px`,
            fontWeight: block.bold ? 700 : 400,
            fontStyle: block.italic ? "italic" : "normal",
            lineHeight: block.lineHeight,
            textTransform: block.uppercase ? "uppercase" : "none",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            WebkitTextStroke: `${scaledStrokeWidth}px rgba(0,0,0,0.55)`,
            paintOrder: "stroke fill",
          }}
        >
          {block.text}
        </div>
      </div>
      <button
        type="button"
        aria-label="Redimensionar bloco"
        className="absolute bottom-0 right-0 h-4 w-4 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-sm border border-white bg-secondary"
        onPointerDown={(event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          onSelect();
          onStart(block.id, "resize");
        }}
      />
      {selected && <div className="pointer-events-none absolute -top-6 left-0 rounded bg-secondary px-2 py-1 text-[10px] font-bold text-secondary-foreground"><Type className="inline h-3 w-3 mr-1" /> Bloco selecionado</div>}
    </div>
  );
}

function FieldNumber({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (value: number) => void; step?: number; min?: number; max?: number }) {
  return <div><Label>{label}</Label><Input type="number" step={step} min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} /></div>;
}

function FieldColor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><Label>{label}</Label><Input type="color" value={value} onChange={(e) => onChange(e.target.value)} /></div>;
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
  return canvas.toDataURL("image/jpeg", 0.82);
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

async function renderCoverToCanvas(args: { imageDataUrl: string; blocks: TextBlock[] }) {
  const img = await loadImage(args.imageDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_CANVAS_WIDTH;
  canvas.height = EXPORT_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível gerar o PDF.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  args.blocks.forEach((block) => drawBlock(ctx, block));
  return canvas;
}

function drawBlock(ctx: CanvasRenderingContext2D, block: TextBlock) {
  const x = pct(block.x, EXPORT_CANVAS_WIDTH);
  const y = pct(block.y, EXPORT_CANVAS_HEIGHT);
  const w = pct(block.width, EXPORT_CANVAS_WIDTH);
  const h = pct(block.height, EXPORT_CANVAS_HEIGHT);
  const pad = block.padding;
  if (block.backgroundOpacity > 0 || block.borderWidth > 0) drawRoundRect(ctx, x, y, w, h, block.borderRadius, hexToRgba(block.backgroundColor, block.backgroundOpacity), block.borderColor, block.borderWidth);
  ctx.save();
  ctx.fillStyle = block.color;
  ctx.font = `${block.italic ? "italic " : ""}${block.bold ? "700 " : "400 "}${block.fontSize}px Arial`;
  ctx.textAlign = block.align;
  ctx.textBaseline = "top";
  const text = block.uppercase ? block.text.toUpperCase() : block.text;
  const lines = wrapText(ctx, text, w - pad * 2);
  const lineHeight = block.fontSize * block.lineHeight;
  const totalTextH = lines.length * lineHeight;
  let startY = y + pad;
  if (totalTextH < h - pad * 2) startY = y + (h - totalTextH) / 2;
  const textX = block.align === "left" ? x + pad : block.align === "center" ? x + w / 2 : x + w - pad;
  const maxWidth = w - pad * 2;
  lines.forEach((line, index) => {
    const lineY = startY + index * lineHeight;
    ctx.lineWidth = Math.max(2, block.fontSize * 0.06);
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(line, textX, lineY, maxWidth);
    ctx.fillText(line, textX, lineY, maxWidth);
  });
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const result: string[] = [];
  text.split("\n").forEach((paragraph) => {
    const words = paragraph.split(" ");
    let line = "";
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else {
        result.push(line);
        line = word;
      }
    });
    result.push(line);
  });
  return result;
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string, stroke: string, lineWidth: number) {
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
  if (lineWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
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

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
