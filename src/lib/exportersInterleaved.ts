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

type ImageType = "png" | "jpg";
type ExportOptions = {
  title: string;
  questions: QuestionRow[];
  includeAnswers: boolean;
  coverDataUrl?: string;
  questionBackgroundDataUrl?: string;
  answerBackgroundDataUrl?: string;
  levelPageDataUrls?: Record<number, string | undefined>;
};
type LoadedImage = { bytes: Uint8Array; dataUrl: string; type: ImageType; pdfType: "PNG" | "JPEG" };

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
  const [bgQuestao, bgGabarito, cover] = await Promise.all([
    loadImageSource(opts.questionBackgroundDataUrl || BG_QUESTAO_URL),
    loadImageSource(opts.answerBackgroundDataUrl || BG_GABARITO_URL),
    opts.coverDataUrl ? loadImageSource(opts.coverDataUrl) : Promise.resolve(null),
  ]);
  const levelPages = await loadLevelPages(opts, groups.map((g) => g.level));
  const sections: any[] = [];
  if (cover) sections.push(fullImageSection(cover));

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
  return [new Paragraph({ spacing: { before: 260, after: 80 }, children: [] }), docxQuestionLabelBlock(num), new Paragraph({ spacing: { after: 80 }, children: [] }), docxQuestionPromptBlock(q), new Paragraph({ spacing: { after: 95 }, children: [] }), docxQuestionAlternativesBlock(q)];
}
function docxQuestionLabelBlock(num: number): Table {
  return new Table({ width: { size: 98, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, borders: tableBorders(BORDER_BLUE), rows: [new TableRow({ children: [new TableCell({ shading: { fill: WHITE }, borders: tableBorders(BORDER_BLUE), margins: { top: 90, bottom: 90, left: 140, right: 140 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "▤", bold: true, size: 21, color: NAVY_TEXT }), new TextRun({ text: `  QUESTÃO ${num}`, bold: true, size: 22, color: NAVY_TEXT })] })] })] })] });
}
function docxQuestionPromptBlock(q: QuestionRow): Table {
  const intro = cleanInlineText(q.intro);
  const command = cleanInlineText(q.command);
  return new Table({ width: { size: 98, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, borders: tableBorders(BORDER_BLUE), rows: [new TableRow({ children: [new TableCell({ shading: { fill: WHITE }, borders: tableBorders(BORDER_BLUE), margins: { top: 200, bottom: 200, left: 105, right: 105 }, verticalAlign: VerticalAlign.CENTER, children: [...(intro ? [new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 110, line: 345 }, children: [new TextRun({ text: intro, size: 24, color: NAVY_TEXT })] })] : []), new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: 355 }, children: [new TextRun({ text: command, bold: true, size: 25, color: NAVY_TEXT })] })] })] })] });
}
function docxQuestionAlternativesBlock(q: QuestionRow): Table {
  return new Table({ width: { size: 98, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, borders: tableBorders(BORDER_BLUE), rows: [new TableRow({ children: [new TableCell({ shading: { fill: LIGHT_BLUE }, borders: tableBorders(BORDER_BLUE), margins: { top: 115, bottom: 125, left: 60, right: 60 }, children: letterAlternatives(q).map((alt) => docxQuestionAlternative(alt)) })] })] });
}
function docxQuestionAlternative(alt: { letter: string; text: string }): Table {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders(BORDER_GRAY), rows: [new TableRow({ children: [new TableCell({ width: { size: 7, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, shading: { fill: NAVY }, margins: { top: 86, bottom: 86, left: 45, right: 45 }, borders: tableBorders(NAVY), children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: alt.letter, bold: true, color: GOLD, size: 23 })] })] }), new TableCell({ width: { size: 93, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, shading: { fill: WHITE }, margins: { top: 86, bottom: 86, left: 65, right: 65 }, borders: tableBorders(BORDER_GRAY), children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { line: 325 }, children: [new TextRun({ text: alt.text, color: NAVY_TEXT, size: 22 })] })] })] })] });
}
function buildDocxAnswerPage(q: QuestionRow, num: number): any[] { return [new Paragraph({ spacing: { before: 180, after: 80 }, children: [] }), docxAnswerMainBlock(q, num)]; }
function docxAnswerMainBlock(q: QuestionRow, num: number): Table {
  return new Table({ width: { size: 98, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, borders: tableBorders(BORDER_BLUE), rows: [new TableRow({ children: [new TableCell({ verticalAlign: VerticalAlign.TOP, margins: { top: 145, bottom: 145, left: 115, right: 115 }, borders: tableBorders(BORDER_BLUE), shading: { fill: WHITE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 105 }, children: [new TextRun({ text: `QUESTÃO ${num}   `, bold: true, size: 21, color: NAVY_TEXT }), new TextRun({ text: "Gabarito: ", bold: true, size: 19, color: NAVY_TEXT }), new TextRun({ text: q.correct, bold: true, size: 23, color: GREEN })] }), new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 90, after: 110 }, children: [new TextRun({ text: "Explicação das alternativas", bold: true, size: 21, color: NAVY_TEXT })] }), ...letterAlternatives(q).map((alt) => docxAnswerAlternativeCard(alt, alt.letter === q.correct))] })] })] });
}
function docxAnswerAlternativeCard(alt: { letter: string; exp: string | null }, isCorrect: boolean): Table {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders(isCorrect ? "C7E3CF" : BORDER_GRAY), rows: [new TableRow({ children: [new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, shading: { fill: isCorrect ? GREEN : NAVY }, margins: { top: 82, bottom: 82, left: 55, right: 55 }, borders: tableBorders(isCorrect ? GREEN : NAVY), children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: alt.letter, bold: true, color: isCorrect ? WHITE : GOLD, size: 23 })] })] }), new TableCell({ width: { size: 92, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, shading: { fill: WHITE }, margins: { top: 82, bottom: 82, left: 75, right: 75 }, borders: tableBorders(isCorrect ? "C7E3CF" : BORDER_GRAY), children: [new Paragraph({ spacing: { line: 315 }, children: [new TextRun({ text: isCorrect ? "Correta: " : "Incorreta: ", bold: true, color: isCorrect ? GREEN : RED, size: 21 }), new TextRun({ text: alt.exp || "—", color: NAVY_TEXT, size: 21 })] })] })] })] });
}

export async function exportPdfInterleaved(opts: ExportOptions) {
  const pageW = 595.28;
  const pageH = 841.89;
  const groups = groupedByLevel(opts.questions);
  const [bgQuestao, bgGabarito, cover] = await Promise.all([
    loadImageSource(opts.questionBackgroundDataUrl || BG_QUESTAO_URL),
    loadImageSource(opts.answerBackgroundDataUrl || BG_GABARITO_URL),
    opts.coverDataUrl ? loadImageSource(opts.coverDataUrl) : Promise.resolve(null),
  ]);
  const levelPages = await loadLevelPages(opts, groups.map((g) => g.level));
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let hasContentPage = false;
  const usePage = () => { if (hasContentPage) doc.addPage(); hasContentPage = true; };
  const drawFullImage = (img: LoadedImage) => doc.addImage(img.dataUrl, img.pdfType, 0, 0, pageW, pageH, undefined, "FAST");

  if (cover) { usePage(); drawFullImage(cover); }
  groups.forEach((group) => {
    const levelPage = levelPages.get(group.level);
    if (levelPage) { usePage(); drawFullImage(levelPage); }
    group.questions.forEach((q, idx) => {
      const num = questionNumber(q, idx);
      usePage(); drawFullImage(bgQuestao); drawPdfQuestionContent(doc, q, num);
      if (opts.includeAnswers) { usePage(); drawFullImage(bgGabarito); drawPdfAnswerContent(doc, q, num); }
    });
  });
  doc.save(`${slug(opts.title)}.pdf`);
}

function splitPdfLines(doc: jsPDF, text: string, maxWidth: number, fontSize: number, fontStyle: "normal" | "bold" = "normal") {
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(cleanInlineText(text), maxWidth) as string[];
}

function drawPdfQuestionContent(doc: jsPDF, q: QuestionRow, num: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const safe = PDF_SAFE_QUESTION;
  const blockX = safe.left;
  const blockW = pageW - safe.left - safe.right;
  let y = safe.top;
  const navy: [number, number, number] = [6, 36, 92];
  const navyText: [number, number, number] = [7, 31, 99];
  const gold: [number, number, number] = [255, 196, 0];
  const borderBlue: [number, number, number] = [185, 215, 255];
  const borderGray: [number, number, number] = [217, 230, 247];

  doc.setFillColor(255,255,255); doc.setDrawColor(...borderBlue); doc.roundedRect(blockX, y, blockW, 42, 10, 10, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(14.8); doc.setTextColor(...navyText); doc.text(`QUESTÃO ${num}`, pageW/2, y + 26, { align: "center" });
  y += 54;

  const promptFontSize = 12.2;
  const intro = cleanInlineText(q.intro);
  const command = cleanInlineText(q.command);
  const promptText = [intro, command].filter(Boolean).join(" ");
  const promptMaxW = blockW - 24;
  const promptLines = splitPdfLines(doc, promptText, promptMaxW, promptFontSize, "normal");
  const promptH = Math.max(92, promptLines.length * 15.4 + 30);
  doc.setFillColor(255,255,255); doc.setDrawColor(...borderBlue); doc.roundedRect(blockX, y, blockW, promptH, 10, 10, "FD");
  doc.setFont("helvetica", "normal"); doc.setFontSize(promptFontSize); doc.setTextColor(...navyText); doc.text(promptLines, blockX + 12, y + 24);
  y += promptH + 14;

  doc.setFillColor(248,251,255); doc.setDrawColor(...borderBlue); doc.roundedRect(blockX, y, blockW, 430, 10, 10, "FD");
  y += 16;
  letterAlternatives(q).forEach((alt) => {
    const altFontSize = 11.2;
    const lines = splitPdfLines(doc, alt.text, blockW - 74, altFontSize, "normal");
    const h = Math.max(54, lines.length * 13.8 + 22);
    doc.setFillColor(255,255,255); doc.setDrawColor(...borderGray); doc.roundedRect(blockX + 8, y, blockW - 16, h, 8, 8, "FD");
    doc.setFillColor(...navy); doc.circle(blockX + 34, y + 24, 15, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(17.5); doc.setTextColor(...gold); doc.text(alt.letter, blockX + 34, y + 30, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(altFontSize); doc.setTextColor(...navyText); doc.text(lines, blockX + 58, y + 20);
    y += h + 9;
  });
}

function drawAnswerExplanation(doc: jsPDF, args: { label: string; body: string; x: number; y: number; maxWidth: number; fontSize: number; labelColor: [number, number, number]; bodyColor: [number, number, number]; maxLines: number }) {
  const { label, body, x, y, maxWidth, fontSize, labelColor, bodyColor, maxLines } = args;
  const cleanBody = cleanInlineText(body || "—");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  const labelWidth = doc.getTextWidth(label);
  const firstLineBodyWidth = Math.max(40, maxWidth - labelWidth);
  const words = cleanBody.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let currentMaxWidth = firstLineBodyWidth;

  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    if (doc.getTextWidth(test) <= currentMaxWidth || !current) {
      current = test;
      return;
    }
    lines.push(current);
    current = word;
    currentMaxWidth = maxWidth;
  });
  if (current) lines.push(current);

  const visible = lines.slice(0, maxLines);
  const lineStep = fontSize + 2.4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(...labelColor);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...bodyColor);
  if (visible[0]) doc.text(visible[0], x + labelWidth, y);
  visible.slice(1).forEach((line, index) => doc.text(line, x, y + (index + 1) * lineStep));
  return { lines: Math.max(1, visible.length), lineStep };
}

function drawPdfAnswerContent(doc: jsPDF, q: QuestionRow, num: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const safe = PDF_SAFE_ANSWER;
  const blockX = safe.left;
  const blockW = pageW - safe.left - safe.right;
  let y = safe.top;
  const mainH = pageH - safe.top - safe.bottom;
  const navy: [number, number, number] = [6, 36, 92];
  const navyText: [number, number, number] = [7, 31, 99];
  const green: [number, number, number] = [19, 138, 54];
  const red: [number, number, number] = [227, 27, 27];
  const borderBlue: [number, number, number] = [185, 215, 255];
  const borderGray: [number, number, number] = [217, 230, 247];

  doc.setFillColor(255,255,255); doc.setDrawColor(...borderBlue); doc.roundedRect(blockX, y, blockW, mainH, 10, 10, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(14.5); doc.setTextColor(...navyText); doc.text(`QUESTÃO ${num}`, pageW/2 - 60, y + 34, { align: "right" });
  doc.setFillColor(...navy); doc.roundedRect(pageW/2 - 45, y + 14, 116, 29, 6, 6, "F");
  doc.setFontSize(11.5); doc.setTextColor(255,255,255); doc.text("Gabarito:", pageW/2 - 28, y + 34); doc.setFontSize(17.5); doc.setTextColor(...green); doc.text(q.correct, pageW/2 + 45, y + 36);
  y += 68;
  doc.setFontSize(13); doc.setTextColor(...navyText); doc.text("Explicação das alternativas", pageW/2, y, { align: "center" });
  y += 18;
  letterAlternatives(q).forEach((alt) => {
    const isCorrect = alt.letter === q.correct;
    const label = isCorrect ? "Correta: " : "Incorreta: ";
    const answerFontSize = 10.8;
    const maxTextW = blockW - 78;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(answerFontSize);
    const estimatedLines = splitPdfLines(doc, `${label}${alt.exp || "—"}`, maxTextW, answerFontSize, "normal").slice(0, 6);
    const h = Math.max(74, estimatedLines.length * 13.2 + 24);
    doc.setFillColor(255,255,255); doc.setDrawColor(...borderGray); doc.roundedRect(blockX + 8, y, blockW - 16, h, 8, 8, "FD");
    doc.setFillColor(...(isCorrect ? green : navy)); doc.circle(blockX + 34, y + 24, 16, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(18.5); doc.setTextColor(255,255,255); doc.text(alt.letter, blockX + 34, y + 30, { align: "center" });
    drawAnswerExplanation(doc, { label, body: alt.exp || "—", x: blockX + 58, y: y + 22, maxWidth: maxTextW, fontSize: answerFontSize, labelColor: isCorrect ? green : red, bodyColor: navyText, maxLines: 6 });
    y += h + 8;
  });
}
