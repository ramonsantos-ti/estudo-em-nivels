import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from "docx";
import pkg from "file-saver";
const { saveAs } = pkg;
import jsPDF from "jspdf";
import type { QuestionRow } from "./exporters";

const NAVY = "0B1E4D";
const NAVY_TEXT = "071F63";
const GOLD = "F2C300";
const GREEN = "138A36";
const GREEN_LIGHT = "EEF8F1";
const RED = "E31B1B";
const BORDER_BLUE = "B9D7FF";
const BORDER_GRAY = "D9E6F7";
const WHITE = "FFFFFF";
const LIGHT_BLUE = "F8FBFF";

const BG_QUESTAO_URL = "/templates/bg-questao.png";
const BG_GABARITO_URL = "/templates/bg-gabarito.png";
const DOCX_QUESTION_MARGIN = { top: 1650, bottom: 850, left: 520, right: 520 };
const DOCX_ANSWER_MARGIN = { top: 1950, bottom: 850, left: 520, right: 520 };
const DOCX_FULL_PAGE_MARGIN = { top: 0, bottom: 0, left: 0, right: 0 };
const PDF_SAFE_QUESTION = { top: 124, bottom: 64, left: 30, right: 30 };
const PDF_SAFE_ANSWER = { top: 158, bottom: 58, left: 30, right: 30 };
const PDF_FIT_SCALES = [1, 0.94, 0.89] as const;

type ImageType = "png" | "jpg";
type Rgb = [number, number, number];
type LoadedImage = { bytes: Uint8Array; dataUrl: string; type: ImageType; pdfType: "PNG" | "JPEG" };
type ExportOptions = {
  title: string;
  questions: QuestionRow[];
  includeAnswers: boolean;
  coverDataUrl?: string;
  aboutPageDataUrls?: string[];
  questionBackgroundDataUrl?: string;
  answerBackgroundDataUrl?: string;
  levelPageDataUrls?: Record<number, string | undefined>;
};
type QuestionAltLayout = { letter: string; text: string; lines: string[]; h: number };
type AnswerLayout = { letter: string; exp: string | null; isCorrect: boolean; label: string; lines: string[]; labelWidth: number; firstLineBodyWidth: number; h: number; lineStep: number };
type QuestionMetrics = { promptFont: number; promptLineStep: number; altFont: number; altLineStep: number; headerFont: number; iconFont: number; altCircleFont: number; promptMinH: number; altMinH: number; altGap: number; scale: number };
type AnswerMetrics = { headerFont: number; titleFont: number; answerLabelFont: number; answerLetterFont: number; answerFont: number; answerLineStep: number; circleFont: number; cardMinH: number; cardGap: number; scale: number };

function cleanText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\n{2,}/g, " ¶¶ ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/ ¶¶ /g, "\n\n")
    .trim();
}
function cleanInlineText(value: string | null | undefined) {
  return cleanText(value).replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}
function inferImageType(source: string): ImageType {
  return /^data:image\/(jpe?g)/i.test(source) || /\.jpe?g($|\?)/i.test(source) ? "jpg" : "png";
}
function normalizeDataUrl(base64: string, type: ImageType) {
  return `data:image/${type === "jpg" ? "jpeg" : "png"};base64,${base64}`;
}
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function loadImageSource(source: string): Promise<LoadedImage> {
  const type = inferImageType(source);
  if (source.startsWith("data:image/")) {
    const base64 = source.split(",")[1] ?? "";
    return { bytes: base64ToBytes(base64), dataUrl: source, type, pdfType: type === "jpg" ? "JPEG" : "PNG" };
  }
  const res = await fetch(source);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return { bytes, dataUrl: normalizeDataUrl(base64, type), type, pdfType: type === "jpg" ? "JPEG" : "PNG" };
}
function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ebook";
}
function questionNumber(q: QuestionRow, index: number) { return q.number ?? index + 1; }
function letterAlternatives(q: QuestionRow) {
  return [
    { letter: "A", text: cleanInlineText(q.alt_a), exp: cleanInlineText(q.exp_a) },
    { letter: "B", text: cleanInlineText(q.alt_b), exp: cleanInlineText(q.exp_b) },
    { letter: "C", text: cleanInlineText(q.alt_c), exp: cleanInlineText(q.exp_c) },
    { letter: "D", text: cleanInlineText(q.alt_d), exp: cleanInlineText(q.exp_d) },
    { letter: "E", text: cleanInlineText(q.alt_e), exp: cleanInlineText(q.exp_e) },
  ];
}
function groupedByLevel(questions: QuestionRow[]) {
  return [1, 2, 3, 4]
    .map((level) => ({ level, questions: questions.filter((q: any) => q.level === level) }))
    .filter((group) => group.questions.length > 0);
}
async function loadLevelPages(opts: ExportOptions, levels: number[]) {
  const entries = await Promise.all(levels.map(async (level) => {
    const source = opts.levelPageDataUrls?.[level];
    if (!source) return [level, null] as const;
    return [level, await loadImageSource(source)] as const;
  }));
  return new Map<number, LoadedImage | null>(entries);
}
async function loadAboutPages(opts: ExportOptions) {
  return Promise.all((opts.aboutPageDataUrls ?? []).filter(Boolean).map((source) => loadImageSource(source)));
}
function tableBorders(color: string) {
  return {
    top: { style: BorderStyle.SINGLE, size: 8, color }, bottom: { style: BorderStyle.SINGLE, size: 8, color },
    left: { style: BorderStyle.SINGLE, size: 8, color }, right: { style: BorderStyle.SINGLE, size: 8, color },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color },
  };
}
function bgHeader(image: LoadedImage): Header {
  return new Header({ children: [new Paragraph({ children: [new ImageRun({ type: image.type, data: image.bytes, transformation: { width: 595, height: 842 }, floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 }, verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 }, behindDocument: true, wrap: { type: TextWrappingType.NONE } } } as any)] })] });
}
function fullImageSection(image: LoadedImage) {
  return { properties: { page: { margin: DOCX_FULL_PAGE_MARGIN } }, headers: { default: bgHeader(image) }, children: [new Paragraph({ children: [] })] };
}

export async function exportDocxInterleaved(opts: ExportOptions) {
  const groups = groupedByLevel(opts.questions);
  const [bgQuestao, bgGabarito, cover, aboutPages] = await Promise.all([
    loadImageSource(opts.questionBackgroundDataUrl || BG_QUESTAO_URL),
    loadImageSource(opts.answerBackgroundDataUrl || BG_GABARITO_URL),
    opts.coverDataUrl ? loadImageSource(opts.coverDataUrl) : Promise.resolve(null),
    loadAboutPages(opts),
  ]);
  const levelPages = await loadLevelPages(opts, groups.map((g) => g.level));
  const sections: any[] = [];
  if (cover) sections.push(fullImageSection(cover));
  aboutPages.forEach((page) => sections.push(fullImageSection(page)));
  groups.forEach((group) => {
    const levelPage = levelPages.get(group.level);
    if (levelPage) sections.push(fullImageSection(levelPage));
    group.questions.forEach((q, index) => {
      const num = questionNumber(q, index);
      sections.push({ properties: { page: { margin: DOCX_QUESTION_MARGIN } }, headers: { default: bgHeader(bgQuestao) }, children: buildDocxQuestionPage(q, num) });
      if (opts.includeAnswers) sections.push({ properties: { page: { margin: DOCX_ANSWER_MARGIN } }, headers: { default: bgHeader(bgGabarito) }, children: buildDocxAnswerPage(q, num) });
    });
  });
  const doc = new Document({ creator: "Questão de Sucesso", title: opts.title, styles: { default: { document: { run: { font: "Arial", size: 23 } } } }, sections });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${slug(opts.title)}.docx`);
}
function buildDocxQuestionPage(q: QuestionRow, num: number): any[] {
  return [new Paragraph({ spacing: { before: 210, after: 45 }, children: [] }), docxQuestionLabelBlock(num), new Paragraph({ spacing: { after: 45 }, children: [] }), docxQuestionPromptBlock(q), new Paragraph({ spacing: { after: 45 }, children: [] }), docxQuestionAlternativesBlock(q)];
}
function docxQuestionLabelBlock(num: number): Table {
  return new Table({ width: { size: 98, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, borders: tableBorders(BORDER_BLUE), rows: [new TableRow({ children: [new TableCell({ shading: { fill: WHITE }, borders: tableBorders(BORDER_BLUE), margins: { top: 80, bottom: 80, left: 140, right: 140 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "▤", bold: true, size: 21, color: NAVY_TEXT }), new TextRun({ text: `  QUESTÃO ${num}`, bold: true, size: 22, color: NAVY_TEXT })] })] })] })] });
}
function docxQuestionPromptBlock(q: QuestionRow): Table {
  const intro = cleanInlineText(q.intro);
  const command = cleanInlineText(q.command);
  const children: Paragraph[] = [];
  if (intro) {
    children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: 345 }, children: [new TextRun({ text: intro, size: 24, bold: true, color: NAVY_TEXT })] }));
    children.push(new Paragraph({ spacing: { before: 110, after: 110 }, children: [new TextRun({ text: "" })] }));
  }
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 355 }, children: [new TextRun({ text: command, bold: true, size: 25, color: NAVY_TEXT })] }));
  return new Table({ width: { size: 98, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, borders: tableBorders(BORDER_BLUE), rows: [new TableRow({ children: [new TableCell({ shading: { fill: WHITE }, borders: tableBorders(BORDER_BLUE), margins: { top: 155, bottom: 155, left: 95, right: 95 }, verticalAlign: VerticalAlign.CENTER, children })] })] });
}
function docxQuestionAlternativesBlock(q: QuestionRow): Table {
  return new Table({ width: { size: 98, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, borders: tableBorders(BORDER_BLUE), rows: [new TableRow({ children: [new TableCell({ shading: { fill: LIGHT_BLUE }, borders: tableBorders(BORDER_BLUE), margins: { top: 80, bottom: 85, left: 50, right: 50 }, children: letterAlternatives(q).map((alt) => docxQuestionAlternative(alt)) })] })] });
}
function docxQuestionAlternative(alt: { letter: string; text: string }): Table {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders(BORDER_GRAY), rows: [new TableRow({ children: [new TableCell({ width: { size: 7, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, shading: { fill: NAVY }, margins: { top: 70, bottom: 70, left: 42, right: 42 }, borders: tableBorders(NAVY), children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: alt.letter, bold: true, color: GOLD, size: 23 })] })] }), new TableCell({ width: { size: 93, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, shading: { fill: WHITE }, margins: { top: 70, bottom: 70, left: 58, right: 58 }, borders: tableBorders(BORDER_GRAY), children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { line: 325 }, children: [new TextRun({ text: alt.text, bold: true, color: NAVY_TEXT, size: 22 })] })] })] })] });
}
function buildDocxAnswerPage(q: QuestionRow, num: number): any[] { return [new Paragraph({ spacing: { before: 120, after: 45 }, children: [] }), docxAnswerMainBlock(q, num)]; }
function docxAnswerMainBlock(q: QuestionRow, num: number): Table {
  return new Table({ width: { size: 98, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, borders: tableBorders(BORDER_BLUE), rows: [new TableRow({ children: [new TableCell({ verticalAlign: VerticalAlign.TOP, margins: { top: 95, bottom: 95, left: 100, right: 100 }, borders: tableBorders(BORDER_BLUE), shading: { fill: WHITE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: `QUESTÃO ${num}`, bold: true, size: 21, color: NAVY_TEXT })] }), new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 65 }, children: [new TextRun({ text: "Gabarito: ", bold: true, size: 19, color: NAVY_TEXT }), new TextRun({ text: q.correct, bold: true, size: 23, color: GREEN })] }), new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 35, after: 65 }, children: [new TextRun({ text: "Explicação das alternativas", bold: true, size: 21, color: NAVY_TEXT })] }), ...letterAlternatives(q).map((alt) => docxAnswerAlternativeCard(alt, alt.letter === q.correct))] })] })] });
}
function docxAnswerAlternativeCard(alt: { letter: string; exp: string | null }, isCorrect: boolean): Table {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders(isCorrect ? "C7E3CF" : BORDER_GRAY), rows: [new TableRow({ children: [new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, shading: { fill: isCorrect ? GREEN : NAVY }, margins: { top: 62, bottom: 62, left: 50, right: 50 }, borders: tableBorders(isCorrect ? GREEN : NAVY), children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: alt.letter, bold: true, color: isCorrect ? WHITE : GOLD, size: 23 })] })] }), new TableCell({ width: { size: 92, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, shading: { fill: isCorrect ? GREEN_LIGHT : WHITE }, margins: { top: 62, bottom: 62, left: 65, right: 65 }, borders: tableBorders(isCorrect ? "C7E3CF" : BORDER_GRAY), children: [new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: 315 }, children: [new TextRun({ text: isCorrect ? "Correta: " : "Incorreta: ", bold: true, color: isCorrect ? GREEN : RED, size: 21 }), new TextRun({ text: alt.exp || "—", bold: true, color: NAVY_TEXT, size: 21 })] })] })] })] });
}

export async function exportPdfInterleaved(opts: ExportOptions) {
  const pageW = 595.28;
  const pageH = 841.89;
  const groups = groupedByLevel(opts.questions);
  const [bgQuestao, bgGabarito, cover, aboutPages] = await Promise.all([
    loadImageSource(opts.questionBackgroundDataUrl || BG_QUESTAO_URL),
    loadImageSource(opts.answerBackgroundDataUrl || BG_GABARITO_URL),
    opts.coverDataUrl ? loadImageSource(opts.coverDataUrl) : Promise.resolve(null),
    loadAboutPages(opts),
  ]);
  const levelPages = await loadLevelPages(opts, groups.map((g) => g.level));
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let hasContentPage = false;
  const usePage = () => { if (hasContentPage) doc.addPage(); hasContentPage = true; };
  const drawFullImage = (img: LoadedImage) => doc.addImage(img.dataUrl, img.pdfType, 0, 0, pageW, pageH, undefined, "FAST");
  if (cover) { usePage(); drawFullImage(cover); }
  aboutPages.forEach((page) => { usePage(); drawFullImage(page); });
  groups.forEach((group) => {
    const levelPage = levelPages.get(group.level);
    if (levelPage) { usePage(); drawFullImage(levelPage); }
    group.questions.forEach((q, idx) => {
      const num = questionNumber(q, idx);
      usePage(); drawFullImage(bgQuestao); drawPdfQuestionContent(doc, q, num, () => { usePage(); drawFullImage(bgQuestao); });
      if (opts.includeAnswers) { usePage(); drawFullImage(bgGabarito); drawPdfAnswerContent(doc, q, num, () => { usePage(); drawFullImage(bgGabarito); }); }
    });
  });
  doc.save(`${slug(opts.title)}.pdf`);
}
function splitPdfLines(doc: jsPDF, text: string, maxWidth: number, fontSize: number, fontStyle: "normal" | "bold" = "normal") {
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(cleanInlineText(text), maxWidth) as string[];
}
function drawNotebookIcon(doc: jsPDF, x: number, y: number, color: Rgb) {
  doc.setDrawColor(...color); doc.setLineWidth(1.2); doc.roundedRect(x + 3, y, 13, 16, 2, 2, "S");
  doc.line(x + 6, y + 4, x + 13, y + 4); doc.line(x + 6, y + 8, x + 13, y + 8); doc.line(x + 6, y + 12, x + 12, y + 12);
  doc.line(x + 1, y + 4, x + 4, y + 4); doc.line(x + 1, y + 8, x + 4, y + 8); doc.line(x + 1, y + 12, x + 4, y + 12);
}
function drawJustifiedLine(doc: jsPDF, line: string, x: number, y: number, maxWidth: number, justify: boolean) {
  const words = cleanInlineText(line).split(/\s+/).filter(Boolean);
  if (!justify || words.length < 2) { doc.text(words.join(" "), x, y); return; }
  const wordsWidth = words.reduce((sum, word) => sum + doc.getTextWidth(word), 0);
  const gap = Math.max(3, (maxWidth - wordsWidth) / (words.length - 1));
  let cursor = x;
  words.forEach((word) => { doc.text(word, cursor, y); cursor += doc.getTextWidth(word) + gap; });
}
function drawCenteredLines(doc: jsPDF, lines: string[], x: number, y: number, lineStep: number) {
  lines.forEach((line, index) => doc.text(line, x, y + index * lineStep, { align: "center" }));
}
function drawJustifiedLines(doc: jsPDF, lines: string[], x: number, y: number, maxWidth: number, lineStep: number) {
  lines.forEach((line, index) => drawJustifiedLine(doc, line, x, y + index * lineStep, maxWidth, index < lines.length - 1));
}
function questionMetrics(scale: number): QuestionMetrics {
  return {
    scale,
    promptFont: 12.2 * scale,
    promptLineStep: 14.8 * scale,
    altFont: 11.2 * scale,
    altLineStep: 13.4 * scale,
    headerFont: 14.8 * scale,
    iconFont: 1,
    altCircleFont: 17.5 * scale,
    promptMinH: 88 * scale,
    altMinH: 50 * scale,
    altGap: 6 * scale,
  };
}
function answerMetrics(scale: number): AnswerMetrics {
  return {
    scale,
    headerFont: 14.5 * scale,
    titleFont: 13 * scale,
    answerLabelFont: 11.5 * scale,
    answerLetterFont: 17.5 * scale,
    answerFont: 10.8 * scale,
    answerLineStep: (10.8 * scale) + 2.4,
    circleFont: 18.5 * scale,
    cardMinH: 68 * scale,
    cardGap: 6 * scale,
  };
}
function drawQuestionHeader(doc: jsPDF, num: number, y: number, pageW: number, blockX: number, blockW: number, navyText: Rgb, borderBlue: Rgb, metrics: QuestionMetrics, continuation = false) {
  doc.setFillColor(255,255,255); doc.setDrawColor(...borderBlue); doc.roundedRect(blockX, y, blockW, 42, 10, 10, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(metrics.headerFont); doc.setTextColor(...navyText);
  const labelText = `QUESTÃO ${num}${continuation ? " — CONTINUAÇÃO" : ""}`;
  const iconW = 18; const labelGap = 8; const labelRowW = iconW + labelGap + doc.getTextWidth(labelText); const labelX = pageW / 2 - labelRowW / 2;
  drawNotebookIcon(doc, labelX, y + 12, navyText); doc.text(labelText, labelX + iconW + labelGap, y + 26);
}
function getQuestionLayouts(doc: jsPDF, q: QuestionRow, blockW: number, metrics: QuestionMetrics) {
  const promptMaxW = blockW - 24;
  const introLines = q.intro ? splitPdfLines(doc, q.intro, promptMaxW, metrics.promptFont, "bold") : [];
  const commandLines = q.command ? splitPdfLines(doc, q.command, promptMaxW, metrics.promptFont, "bold") : [];
  const paragraphGap = introLines.length > 0 && commandLines.length > 0 ? metrics.promptLineStep : 0;
  const totalTextH = (introLines.length + commandLines.length) * metrics.promptLineStep + paragraphGap;
  const promptH = Math.max(metrics.promptMinH, totalTextH + 34 * metrics.scale);
  const alts: QuestionAltLayout[] = letterAlternatives(q).map((alt) => {
    const lines = splitPdfLines(doc, alt.text, blockW - 74, metrics.altFont, "bold");
    return { ...alt, lines, h: Math.max(metrics.altMinH, lines.length * metrics.altLineStep + 18 * metrics.scale) };
  });
  const alternativesH = alts.reduce((sum, alt) => sum + alt.h, 0) + Math.max(0, alts.length - 1) * metrics.altGap + 24 * metrics.scale;
  return { promptMaxW, introLines, commandLines, paragraphGap, totalTextH, promptH, alts, alternativesH };
}
function drawAlternativeCard(doc: jsPDF, alt: QuestionAltLayout, x: number, y: number, w: number, navy: Rgb, navyText: Rgb, gold: Rgb, borderGray: Rgb, metrics: QuestionMetrics) {
  doc.setFillColor(255,255,255); doc.setDrawColor(...borderGray); doc.roundedRect(x, y, w, alt.h, 8, 8, "FD");
  doc.setFillColor(...navy); doc.circle(x + 26, y + 22, 15 * metrics.scale, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(metrics.altCircleFont); doc.setTextColor(...gold); doc.text(alt.letter, x + 26, y + 28, { align: "center" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(metrics.altFont); doc.setTextColor(...navyText); doc.text(alt.lines, x + 50, y + 18);
}
function drawQuestionContentOnePage(doc: jsPDF, q: QuestionRow, num: number, metrics: QuestionMetrics, continuation = false) {
  const pageW = doc.internal.pageSize.getWidth(); const pageH = doc.internal.pageSize.getHeight(); const safe = PDF_SAFE_QUESTION;
  const blockX = safe.left; const blockW = pageW - safe.left - safe.right; let y = safe.top;
  const navy: Rgb = [6, 36, 92]; const navyText: Rgb = [7, 31, 99]; const gold: Rgb = [255, 196, 0]; const borderBlue: Rgb = [185, 215, 255]; const borderGray: Rgb = [217, 230, 247];
  const layout = getQuestionLayouts(doc, q, blockW, metrics);
  drawQuestionHeader(doc, num, y, pageW, blockX, blockW, navyText, borderBlue, metrics, continuation); y += 48;
  doc.setFillColor(255,255,255); doc.setDrawColor(...borderBlue); doc.roundedRect(blockX, y, blockW, layout.promptH, 10, 10, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(metrics.promptFont); doc.setTextColor(...navyText);
  let textY = y + Math.max(20 * metrics.scale, (layout.promptH - layout.totalTextH) / 2 + metrics.promptFont * 0.75);
  if (layout.introLines.length) { drawJustifiedLines(doc, layout.introLines, blockX + 12, textY, layout.promptMaxW, metrics.promptLineStep); textY += layout.introLines.length * metrics.promptLineStep + layout.paragraphGap; }
  if (layout.commandLines.length) drawCenteredLines(doc, layout.commandLines, pageW / 2, textY, metrics.promptLineStep);
  y += layout.promptH + 10 * metrics.scale;
  doc.setFillColor(248,251,255); doc.setDrawColor(...borderBlue); doc.roundedRect(blockX, y, blockW, layout.alternativesH, 10, 10, "FD");
  let cardY = y + 12 * metrics.scale;
  layout.alts.forEach((alt) => { drawAlternativeCard(doc, alt, blockX + 8, cardY, blockW - 16, navy, navyText, gold, borderGray, metrics); cardY += alt.h + metrics.altGap; });
}
function questionFitsOnePage(doc: jsPDF, q: QuestionRow, metrics: QuestionMetrics) {
  const pageW = doc.internal.pageSize.getWidth(); const pageH = doc.internal.pageSize.getHeight(); const safe = PDF_SAFE_QUESTION;
  const blockW = pageW - safe.left - safe.right; const layout = getQuestionLayouts(doc, q, blockW, metrics);
  const bottomLimit = pageH - safe.bottom - 10;
  const totalH = 42 + 6 + layout.promptH + 10 * metrics.scale + layout.alternativesH;
  return safe.top + totalH <= bottomLimit;
}
function drawPdfQuestionContent(doc: jsPDF, q: QuestionRow, num: number, addContinuationPage?: () => void) {
  const fittedScale = PDF_FIT_SCALES.find((scale) => questionFitsOnePage(doc, q, questionMetrics(scale)));
  if (fittedScale) {
    drawQuestionContentOnePage(doc, q, num, questionMetrics(fittedScale), false);
    return;
  }
  const metrics = questionMetrics(1);
  const pageW = doc.internal.pageSize.getWidth(); const pageH = doc.internal.pageSize.getHeight(); const safe = PDF_SAFE_QUESTION;
  const blockX = safe.left; const blockW = pageW - safe.left - safe.right; let y = safe.top;
  const navy: Rgb = [6, 36, 92]; const navyText: Rgb = [7, 31, 99]; const gold: Rgb = [255, 196, 0]; const borderBlue: Rgb = [185, 215, 255]; const borderGray: Rgb = [217, 230, 247];
  const bottomLimit = pageH - safe.bottom - 10;
  const layout = getQuestionLayouts(doc, q, blockW, metrics);
  drawQuestionHeader(doc, num, y, pageW, blockX, blockW, navyText, borderBlue, metrics, false); y += 48;
  doc.setFillColor(255,255,255); doc.setDrawColor(...borderBlue); doc.roundedRect(blockX, y, blockW, layout.promptH, 10, 10, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(metrics.promptFont); doc.setTextColor(...navyText);
  let textY = y + Math.max(20, (layout.promptH - layout.totalTextH) / 2 + metrics.promptFont * 0.75);
  if (layout.introLines.length) { drawJustifiedLines(doc, layout.introLines, blockX + 12, textY, layout.promptMaxW, metrics.promptLineStep); textY += layout.introLines.length * metrics.promptLineStep + layout.paragraphGap; }
  if (layout.commandLines.length) drawCenteredLines(doc, layout.commandLines, pageW / 2, textY, metrics.promptLineStep);
  y += layout.promptH + 10;
  const drawAlternativesFrame = (frameY: number, frameH: number) => { doc.setFillColor(248,251,255); doc.setDrawColor(...borderBlue); doc.roundedRect(blockX, frameY, blockW, Math.max(40, frameH), 10, 10, "FD"); };
  let frameStartY = y;
  let cardY = y + 12;
  let frameDrawn = false;
  layout.alts.forEach((alt) => {
    if (cardY + alt.h > bottomLimit && addContinuationPage) {
      if (!frameDrawn) drawAlternativesFrame(frameStartY, bottomLimit - frameStartY);
      addContinuationPage();
      y = safe.top;
      drawQuestionHeader(doc, num, y, pageW, blockX, blockW, navyText, borderBlue, metrics, true);
      frameStartY = y + 52;
      cardY = frameStartY + 12;
      frameDrawn = false;
    }
    if (!frameDrawn) {
      const remainingLayouts = layout.alts.slice(layout.alts.indexOf(alt));
      const remainingH = remainingLayouts.reduce((sum, item) => sum + item.h, 0) + Math.max(0, remainingLayouts.length - 1) * metrics.altGap + 24;
      drawAlternativesFrame(frameStartY, Math.min(remainingH, bottomLimit - frameStartY));
      frameDrawn = true;
    }
    drawAlternativeCard(doc, alt, blockX + 8, cardY, blockW - 16, navy, navyText, gold, borderGray, metrics);
    cardY += alt.h + metrics.altGap;
  });
}

function splitAnswerExplanation(doc: jsPDF, label: string, body: string, maxWidth: number, fontSize: number) {
  const cleanBody = cleanInlineText(body || "—"); doc.setFont("helvetica", "bold"); doc.setFontSize(fontSize);
  const labelWidth = doc.getTextWidth(label); const firstLineBodyWidth = Math.max(40, maxWidth - labelWidth); const words = cleanBody.split(/\s+/).filter(Boolean); const lines: string[] = [];
  let current = ""; let currentMaxWidth = firstLineBodyWidth;
  words.forEach((word) => { const test = current ? `${current} ${word}` : word; if (doc.getTextWidth(test) <= currentMaxWidth || !current) { current = test; return; } lines.push(current); current = word; currentMaxWidth = maxWidth; });
  if (current) lines.push(current); return { lines: lines.length ? lines : ["—"], labelWidth, firstLineBodyWidth, lineStep: fontSize + 2.4 };
}
function getAnswerLayouts(doc: jsPDF, q: QuestionRow, blockW: number, metrics: AnswerMetrics): AnswerLayout[] {
  const maxTextW = blockW - 78;
  return letterAlternatives(q).map((alt) => {
    const isCorrect = alt.letter === q.correct;
    const label = isCorrect ? "Correta: " : "Incorreta: ";
    const split = splitAnswerExplanation(doc, label, alt.exp || "—", maxTextW, metrics.answerFont);
    return { ...alt, isCorrect, label, lines: split.lines, labelWidth: split.labelWidth, firstLineBodyWidth: split.firstLineBodyWidth, h: Math.max(metrics.cardMinH, split.lines.length * metrics.answerLineStep + 24 * metrics.scale), lineStep: metrics.answerLineStep };
  });
}
function drawAnswerExplanation(doc: jsPDF, args: { label: string; lines: string[]; labelWidth: number; firstLineBodyWidth: number; x: number; y: number; maxWidth: number; fontSize: number; labelColor: Rgb; bodyColor: Rgb }) {
  const { label, lines, labelWidth, firstLineBodyWidth, x, y, maxWidth, fontSize, labelColor, bodyColor } = args; const lineStep = fontSize + 2.4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(fontSize); doc.setTextColor(...labelColor); doc.text(label, x, y); doc.setTextColor(...bodyColor);
  if (lines[0]) drawJustifiedLine(doc, lines[0], x + labelWidth, y, firstLineBodyWidth, lines.length > 1);
  lines.slice(1).forEach((line, index) => drawJustifiedLine(doc, line, x, y + (index + 1) * lineStep, maxWidth, index < lines.length - 2));
}
function drawAnswerFrame(doc: jsPDF, num: number, metrics: AnswerMetrics, isContinuation: boolean) {
  const pageW = doc.internal.pageSize.getWidth(); const pageH = doc.internal.pageSize.getHeight(); const safe = PDF_SAFE_ANSWER; const blockX = safe.left; const blockW = pageW - safe.left - safe.right; const mainH = pageH - safe.top - safe.bottom;
  const navy: Rgb = [6, 36, 92]; const navyText: Rgb = [7, 31, 99]; const green: Rgb = [19, 138, 54]; const borderBlue: Rgb = [185, 215, 255];
  let y = safe.top; doc.setFillColor(255,255,255); doc.setDrawColor(...borderBlue); doc.roundedRect(blockX, y, blockW, mainH, 10, 10, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(metrics.headerFont); doc.setTextColor(...navyText); doc.text(`QUESTÃO ${num}${isContinuation ? " — CONTINUAÇÃO" : ""}`, pageW / 2, y + 32, { align: "center" });
  const gabaritoBoxW = 122; const gabaritoBoxX = blockX + blockW - gabaritoBoxW - 12;
  doc.setFillColor(...navy); doc.roundedRect(gabaritoBoxX, y + 14, gabaritoBoxW, 29, 6, 6, "F");
  return { y, blockX, blockW, gabaritoBoxX, navy, navyText, green };
}
function drawAnswerPageHeaderText(doc: jsPDF, q: QuestionRow, num: number, metrics: AnswerMetrics, isContinuation: boolean) {
  const pageW = doc.internal.pageSize.getWidth(); const frame = drawAnswerFrame(doc, num, metrics, isContinuation);
  doc.setFont("helvetica", "bold"); doc.setFontSize(metrics.answerLabelFont); doc.setTextColor(255,255,255); doc.text("Gabarito:", frame.gabaritoBoxX + 16, frame.y + 34);
  doc.setFontSize(metrics.answerLetterFont); doc.setTextColor(...frame.green); doc.text(q.correct, frame.gabaritoBoxX + 96, frame.y + 36);
  doc.setFontSize(metrics.titleFont); doc.setTextColor(...frame.navyText); doc.text("Explicação das alternativas", pageW/2, frame.y + 58, { align: "center" });
  return frame.y + 72;
}
function drawAnswerCard(doc: jsPDF, alt: AnswerLayout, y: number, blockX: number, blockW: number, metrics: AnswerMetrics) {
  const navy: Rgb = [6, 36, 92]; const navyText: Rgb = [7, 31, 99]; const green: Rgb = [19, 138, 54]; const red: Rgb = [227, 27, 27]; const borderGray: Rgb = [217, 230, 247]; const greenLight: Rgb = [238, 248, 241]; const greenBorder: Rgb = [199, 227, 207];
  const fillColor = alt.isCorrect ? greenLight : [255, 255, 255] as Rgb; const strokeColor = alt.isCorrect ? greenBorder : borderGray;
  doc.setFillColor(...fillColor); doc.setDrawColor(...strokeColor); doc.roundedRect(blockX + 8, y, blockW - 16, alt.h, 8, 8, "FD");
  doc.setFillColor(...(alt.isCorrect ? green : navy)); doc.circle(blockX + 34, y + 22, 16 * metrics.scale, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(metrics.circleFont); doc.setTextColor(255,255,255); doc.text(alt.letter, blockX + 34, y + 28, { align: "center" });
  drawAnswerExplanation(doc, { label: alt.label, lines: alt.lines, labelWidth: alt.labelWidth, firstLineBodyWidth: alt.firstLineBodyWidth, x: blockX + 58, y: y + 20, maxWidth: blockW - 78, fontSize: metrics.answerFont, labelColor: alt.isCorrect ? green : red, bodyColor: navyText });
}
function answerFitsOnePage(doc: jsPDF, q: QuestionRow, metrics: AnswerMetrics) {
  const pageW = doc.internal.pageSize.getWidth(); const pageH = doc.internal.pageSize.getHeight(); const safe = PDF_SAFE_ANSWER; const blockW = pageW - safe.left - safe.right;
  const bottomLimit = pageH - safe.bottom - 14; const startY = safe.top + 72;
  const layouts = getAnswerLayouts(doc, q, blockW, metrics);
  const contentH = layouts.reduce((sum, alt) => sum + alt.h, 0) + Math.max(0, layouts.length - 1) * metrics.cardGap;
  return startY + contentH <= bottomLimit;
}
function drawAnswerContentOnePage(doc: jsPDF, q: QuestionRow, num: number, metrics: AnswerMetrics) {
  const pageW = doc.internal.pageSize.getWidth(); const safe = PDF_SAFE_ANSWER; const blockX = safe.left; const blockW = pageW - safe.left - safe.right;
  let y = drawAnswerPageHeaderText(doc, q, num, metrics, false);
  const layouts = getAnswerLayouts(doc, q, blockW, metrics);
  layouts.forEach((alt) => { drawAnswerCard(doc, alt, y, blockX, blockW, metrics); y += alt.h + metrics.cardGap; });
}
function drawPdfAnswerContent(doc: jsPDF, q: QuestionRow, num: number, addContinuationPage?: () => void) {
  const fittedScale = PDF_FIT_SCALES.find((scale) => answerFitsOnePage(doc, q, answerMetrics(scale)));
  if (fittedScale) {
    drawAnswerContentOnePage(doc, q, num, answerMetrics(fittedScale));
    return;
  }
  const metrics = answerMetrics(1);
  const pageW = doc.internal.pageSize.getWidth(); const pageH = doc.internal.pageSize.getHeight(); const safe = PDF_SAFE_ANSWER; const blockX = safe.left; const blockW = pageW - safe.left - safe.right;
  const bottomLimit = pageH - safe.bottom - 14; let isContinuation = false;
  let y = drawAnswerPageHeaderText(doc, q, num, metrics, isContinuation);
  const layouts = getAnswerLayouts(doc, q, blockW, metrics);
  layouts.forEach((alt) => {
    if (y + alt.h > bottomLimit && addContinuationPage) {
      addContinuationPage();
      isContinuation = true;
      y = drawAnswerPageHeaderText(doc, q, num, metrics, isContinuation);
    }
    drawAnswerCard(doc, alt, y, blockX, blockW, metrics);
    y += alt.h + metrics.cardGap;
  });
}
