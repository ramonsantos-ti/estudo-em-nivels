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

const DOCX_QUESTION_MARGIN = { top: 1700, bottom: 900, left: 720, right: 720 };
const DOCX_ANSWER_MARGIN = { top: 1700, bottom: 900, left: 720, right: 720 };
const DOCX_FULL_PAGE_MARGIN = { top: 0, bottom: 0, left: 0, right: 0 };

const PDF_SAFE_QUESTION = { top: 126, bottom: 72, left: 42, right: 42 };
const PDF_SAFE_ANSWER = { top: 126, bottom: 72, left: 42, right: 42 };

type BackgroundKind = "questao" | "gabarito";
type ImageType = "png" | "jpg";

type ExportOptions = {
  title: string;
  questions: QuestionRow[];
  includeAnswers: boolean;
  questionBackgroundDataUrl?: string;
  answerBackgroundDataUrl?: string;
  levelPageDataUrls?: Record<number, string | undefined>;
};

type LoadedImage = { bytes: Uint8Array; base64: string; dataUrl: string; type: ImageType; pdfType: "PNG" | "JPEG" };

function inferImageType(source: string): ImageType {
  if (/^data:image\/(jpe?g)/i.test(source)) return "jpg";
  return "png";
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
    return { bytes: base64ToBytes(base64), base64, dataUrl: source, type, pdfType: type === "jpg" ? "JPEG" : "PNG" };
  }

  const res = await fetch(source);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return { bytes, base64, dataUrl: normalizeDataUrl(base64, type), type, pdfType: type === "jpg" ? "JPEG" : "PNG" };
}

function letterAlternatives(q: QuestionRow) {
  return [
    { letter: "A", text: q.alt_a, exp: q.exp_a },
    { letter: "B", text: q.alt_b, exp: q.exp_b },
    { letter: "C", text: q.alt_c, exp: q.exp_c },
    { letter: "D", text: q.alt_d, exp: q.exp_d },
    { letter: "E", text: q.alt_e, exp: q.exp_e },
  ];
}

function questionNumber(q: QuestionRow, index: number) {
  return q.number ?? index + 1;
}

function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ebook";
}

function groupedByLevel(questions: QuestionRow[]) {
  return [1, 2, 3, 4]
    .map((level) => ({ level, questions: questions.filter((q: any) => q.level === level) }))
    .filter((group) => group.questions.length > 0);
}

async function loadLevelPages(opts: ExportOptions, levels: number[]) {
  const entries = await Promise.all(
    levels.map(async (level) => {
      const source = opts.levelPageDataUrls?.[level];
      if (!source) return [level, null] as const;
      return [level, await loadImageSource(source)] as const;
    })
  );
  return new Map<number, LoadedImage | null>(entries);
}

function tableBorders(color: string) {
  return {
    top: { style: BorderStyle.SINGLE, size: 8, color },
    bottom: { style: BorderStyle.SINGLE, size: 8, color },
    left: { style: BorderStyle.SINGLE, size: 8, color },
    right: { style: BorderStyle.SINGLE, size: 8, color },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color },
  };
}

export async function exportDocxInterleaved(opts: ExportOptions) {
  const { title, includeAnswers } = opts;
  const groups = groupedByLevel(opts.questions);
  const [bgQuestao, bgGabarito] = await Promise.all([
    loadImageSource(opts.questionBackgroundDataUrl || BG_QUESTAO_URL),
    loadImageSource(opts.answerBackgroundDataUrl || BG_GABARITO_URL),
  ]);
  const levelPages = await loadLevelPages(opts, groups.map((group) => group.level));

  for (const group of groups) {
    const sections: any[] = [];
    const levelPage = levelPages.get(group.level);

    if (levelPage) {
      sections.push({
        properties: { page: { margin: DOCX_FULL_PAGE_MARGIN } },
        headers: { default: bgHeader(levelPage) },
        children: [new Paragraph({ children: [] })],
      });
    }

    group.questions.forEach((q, index) => {
      const num = questionNumber(q, index);
      sections.push({
        properties: { page: { margin: DOCX_QUESTION_MARGIN } },
        headers: { default: bgHeader(bgQuestao) },
        children: buildDocxQuestionPage(q, num),
      });

      if (includeAnswers) {
        sections.push({
          properties: { page: { margin: DOCX_ANSWER_MARGIN } },
          headers: { default: bgHeader(bgGabarito) },
          children: buildDocxAnswerPage(q, num),
        });
      }
    });

    const doc = new Document({
      creator: "Questão de Sucesso",
      title: `${title} - Nível ${group.level}`,
      styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
      sections,
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${slug(title)}-nivel-${group.level}.docx`);
  }
}

function bgHeader(image: LoadedImage): Header {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new ImageRun({
            type: image.type,
            data: image.bytes,
            transformation: { width: 595, height: 842 },
            floating: {
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
              behindDocument: true,
              wrap: { type: TextWrappingType.NONE },
            },
          } as any),
        ],
      }),
    ],
  });
}

function buildDocxQuestionPage(q: QuestionRow, num: number): any[] {
  return [
    new Paragraph({ spacing: { before: 330, after: 90 }, children: [] }),
    docxQuestionLabelBlock(num),
    new Paragraph({ spacing: { after: 95 }, children: [] }),
    docxQuestionPromptBlock(q),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    docxQuestionAlternativesBlock(q),
  ];
}

function docxQuestionLabelBlock(num: number): Table {
  return new Table({
    width: { size: 94, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    borders: tableBorders(BORDER_BLUE),
    rows: [new TableRow({ children: [new TableCell({
      shading: { fill: WHITE },
      borders: tableBorders(BORDER_BLUE),
      margins: { top: 95, bottom: 95, left: 180, right: 180 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "▤", bold: true, size: 20, color: NAVY_TEXT }),
        new TextRun({ text: `  QUESTÃO ${num}`, bold: true, size: 21, color: NAVY_TEXT }),
      ] })],
    })] })],
  });
}

function docxQuestionPromptBlock(q: QuestionRow): Table {
  return new Table({
    width: { size: 94, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    borders: tableBorders(BORDER_BLUE),
    rows: [new TableRow({ children: [new TableCell({
      shading: { fill: WHITE },
      borders: tableBorders(BORDER_BLUE),
      margins: { top: 220, bottom: 220, left: 140, right: 140 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        ...(q.intro ? [new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 330 }, children: [new TextRun({ text: q.intro, size: 23, color: NAVY_TEXT })] })] : []),
        new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: 340 }, children: [new TextRun({ text: q.command, bold: true, size: 24, color: NAVY_TEXT })] }),
      ],
    })] })],
  });
}

function docxQuestionAlternativesBlock(q: QuestionRow): Table {
  return new Table({
    width: { size: 94, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    borders: tableBorders(BORDER_BLUE),
    rows: [new TableRow({ children: [new TableCell({
      shading: { fill: LIGHT_BLUE },
      borders: tableBorders(BORDER_BLUE),
      margins: { top: 140, bottom: 150, left: 95, right: 95 },
      children: letterAlternatives(q).map((alt) => docxQuestionAlternative(alt)),
    })] })],
  });
}

function docxQuestionAlternative(alt: { letter: string; text: string }): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(BORDER_GRAY),
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 9, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, shading: { fill: NAVY }, margins: { top: 92, bottom: 92, left: 60, right: 60 }, borders: tableBorders(NAVY), children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: alt.letter, bold: true, color: GOLD, size: 22 })] })] }),
      new TableCell({ width: { size: 91, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, shading: { fill: WHITE }, margins: { top: 92, bottom: 92, left: 80, right: 80 }, borders: tableBorders(BORDER_GRAY), children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { line: 310 }, children: [new TextRun({ text: alt.text, color: NAVY_TEXT, size: 21 })] })] }),
    ] })],
  });
}

function buildDocxAnswerPage(q: QuestionRow, num: number): any[] {
  return [
    new Paragraph({ spacing: { before: 300, after: 100 }, children: [] }),
    docxAnswerMainBlock(q, num),
  ];
}

function docxAnswerHeading(q: QuestionRow, num: number): Table {
  return new Table({
    width: { size: 58, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    borders: tableBorders(WHITE),
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 52, type: WidthType.PERCENTAGE }, borders: tableBorders(WHITE), margins: { top: 60, bottom: 60, left: 80, right: 110 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `QUESTÃO ${num}`, bold: true, size: 22, color: NAVY_TEXT })] })] }),
      new TableCell({ width: { size: 48, type: WidthType.PERCENTAGE }, shading: { fill: NAVY }, borders: tableBorders(NAVY), margins: { top: 80, bottom: 80, left: 120, right: 120 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Gabarito: ", bold: true, size: 18, color: WHITE }), new TextRun({ text: q.correct, bold: true, size: 22, color: GREEN })] })] }),
    ] })],
  });
}

function docxAnswerMainBlock(q: QuestionRow, num: number): Table {
  return new Table({
    width: { size: 94, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    borders: tableBorders(BORDER_BLUE),
    rows: [new TableRow({ children: [new TableCell({ verticalAlign: VerticalAlign.TOP, margins: { top: 180, bottom: 180, left: 180, right: 180 }, borders: tableBorders(BORDER_BLUE), shading: { fill: WHITE }, children: [
      docxAnswerHeading(q, num),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, children: [new TextRun({ text: "Explicação das alternativas", bold: true, size: 20, color: NAVY_TEXT })] }),
      ...letterAlternatives(q).map((alt) => docxAnswerAlternativeCard(alt, alt.letter === q.correct)),
    ] })] })],
  });
}

function docxAnswerAlternativeCard(alt: { letter: string; exp: string | null }, isCorrect: boolean): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(isCorrect ? "C7E3CF" : BORDER_GRAY),
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, shading: { fill: isCorrect ? GREEN : NAVY }, margins: { top: 90, bottom: 90, left: 80, right: 80 }, borders: tableBorders(isCorrect ? GREEN : NAVY), children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: alt.letter, bold: true, color: isCorrect ? WHITE : GOLD, size: 22 })] })] }),
      new TableCell({ width: { size: 90, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, shading: { fill: isCorrect ? GREEN_LIGHT : WHITE }, margins: { top: 90, bottom: 90, left: 110, right: 110 }, borders: tableBorders(isCorrect ? "C7E3CF" : BORDER_GRAY), children: [new Paragraph({ spacing: { line: 300 }, children: [new TextRun({ text: isCorrect ? "Correta: " : "Incorreta: ", bold: true, color: isCorrect ? GREEN : RED, size: 20 }), new TextRun({ text: alt.exp || "—", color: NAVY_TEXT, size: 20 })] })] }),
    ] })],
  });
}

export async function exportPdfInterleaved(opts: ExportOptions) {
  const { title, includeAnswers } = opts;
  const pageW = 595.28;
  const pageH = 841.89;
  const groups = groupedByLevel(opts.questions);

  const [bgQuestao, bgGabarito] = await Promise.all([
    loadImageSource(opts.questionBackgroundDataUrl || BG_QUESTAO_URL),
    loadImageSource(opts.answerBackgroundDataUrl || BG_GABARITO_URL),
  ]);
  const levelPages = await loadLevelPages(opts, groups.map((group) => group.level));

  for (const group of groups) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let hasContentPage = false;

    function usePage() {
      if (hasContentPage) doc.addPage();
      hasContentPage = true;
    }

    function drawBackground(kind: BackgroundKind) {
      const img = kind === "questao" ? bgQuestao : bgGabarito;
      doc.addImage(img.dataUrl, img.pdfType, 0, 0, pageW, pageH, undefined, "FAST");
    }

    const levelPage = levelPages.get(group.level);
    if (levelPage) {
      usePage();
      doc.addImage(levelPage.dataUrl, levelPage.pdfType, 0, 0, pageW, pageH, undefined, "FAST");
    }

    group.questions.forEach((q, idx) => {
      const num = questionNumber(q, idx);
      usePage();
      drawBackground("questao");
      drawPdfQuestionContent(doc, q, num);

      if (includeAnswers) {
        usePage();
        drawBackground("gabarito");
        drawPdfAnswerContent(doc, q, num);
      }
    });

    doc.save(`${slug(title)}-nivel-${group.level}.pdf`);
  }
}

function drawPdfQuestionContent(doc: jsPDF, q: QuestionRow, num: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const safe = PDF_SAFE_QUESTION;
  const safeW = pageW - safe.left - safe.right;
  const safeH = pageH - safe.top - safe.bottom;

  const navy: [number, number, number] = [6, 36, 92];
  const navyText: [number, number, number] = [7, 31, 99];
  const gold: [number, number, number] = [255, 196, 0];
  const borderBlue: [number, number, number] = [185, 215, 255];
  const borderGray: [number, number, number] = [217, 230, 247];

  const blockX = safe.left;
  const blockW = safeW;
  const layout = resolveQuestionPdfLayout(doc, q, blockW, safeH);
  const innerTextW = blockW - 40;
  const startY = safe.top + Math.max((safeH - layout.totalH) / 2, 0);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...borderBlue);
  doc.roundedRect(blockX, startY, blockW, layout.labelBlockH, 10, 10, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const labelText = `QUESTÃO ${num}`;
  const iconW = 16;
  const gap = 8;
  const labelTextW = doc.getTextWidth(labelText);
  const labelRowW = iconW + gap + labelTextW;
  const labelX = pageW / 2 - labelRowW / 2;
  drawNotebookIcon(doc, labelX, startY + 13, navyText);
  doc.setTextColor(...navyText);
  doc.text(labelText, labelX + iconW + gap, startY + 26);

  const promptY = startY + layout.labelBlockH + 12;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...borderBlue);
  doc.roundedRect(blockX, promptY, blockW, layout.promptBlockH, 10, 10, "FD");

  let cy = promptY + 22;
  if (q.intro) cy = drawJustifiedText(doc, q.intro, blockX + 20, cy, innerTextW, layout.introSize, navyText, "normal", layout.lineGap) + 10;
  drawJustifiedText(doc, q.command, blockX + 20, cy, innerTextW, layout.commandSize, navyText, "bold", layout.lineGap);

  const block2Y = promptY + layout.promptBlockH + 16;
  doc.setFillColor(248, 251, 255);
  doc.setDrawColor(...borderBlue);
  doc.roundedRect(blockX, block2Y, blockW, layout.alternativesBlockH, 10, 10, "FD");

  cy = block2Y + 18;
  letterAlternatives(q).forEach((alt, index) => {
    const cardH = layout.altHeights[index];
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...borderGray);
    doc.roundedRect(blockX + 14, cy, blockW - 28, cardH, 8, 8, "FD");
    doc.setFillColor(...navy);
    doc.circle(blockX + 40, cy + 22, 15, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(...gold);
    doc.text(alt.letter, blockX + 40, cy + 28, { align: "center" });
    drawWrappedText(doc, alt.text, blockX + 66, cy + 17, blockW - 88, layout.altSize, navyText, "normal", "left", undefined, layout.lineGap);
    cy += cardH + 10;
  });
}

function resolveQuestionPdfLayout(doc: jsPDF, q: QuestionRow, blockW: number, safeH: number) {
  const labelBlockH = 42;
  const innerTextW = blockW - 40;
  const altTextW = blockW - 88;
  const candidates = [
    { introSize: 12.4, commandSize: 13.2, altSize: 11.2, lineGap: 4.8 },
    { introSize: 12.0, commandSize: 12.8, altSize: 10.9, lineGap: 4.5 },
    { introSize: 11.6, commandSize: 12.4, altSize: 10.6, lineGap: 4.2 },
    { introSize: 11.2, commandSize: 12.0, altSize: 10.3, lineGap: 4.0 },
    { introSize: 10.8, commandSize: 11.6, altSize: 10.0, lineGap: 3.8 },
    { introSize: 10.4, commandSize: 11.2, altSize: 9.7, lineGap: 3.5 },
  ];

  for (const candidate of candidates) {
    const introH = q.intro ? measureTextHeight(doc, q.intro, innerTextW, candidate.introSize, undefined, candidate.lineGap) + 10 : 0;
    const commandH = measureTextHeight(doc, q.command, innerTextW, candidate.commandSize, undefined, candidate.lineGap) + 8;
    const promptBlockH = introH + commandH + 42;
    const altHeights = letterAlternatives(q).map((alt) => Math.max(54, 18 + measureTextHeight(doc, alt.text, altTextW, candidate.altSize, undefined, candidate.lineGap)));
    const alternativesBlockH = 36 + altHeights.reduce((sum, h) => sum + h, 0) + (altHeights.length - 1) * 10;
    const totalH = labelBlockH + 12 + promptBlockH + 16 + alternativesBlockH;
    if (totalH <= safeH) return { ...candidate, labelBlockH, promptBlockH, altHeights, alternativesBlockH, totalH };
  }

  const fallback = candidates[candidates.length - 1];
  const introH = q.intro ? measureTextHeight(doc, q.intro, innerTextW, fallback.introSize, undefined, fallback.lineGap) + 10 : 0;
  const commandH = measureTextHeight(doc, q.command, innerTextW, fallback.commandSize, undefined, fallback.lineGap) + 8;
  const promptBlockH = introH + commandH + 42;
  const altHeights = letterAlternatives(q).map((alt) => Math.max(54, 18 + measureTextHeight(doc, alt.text, altTextW, fallback.altSize, undefined, fallback.lineGap)));
  const alternativesBlockH = 36 + altHeights.reduce((sum, h) => sum + h, 0) + (altHeights.length - 1) * 10;
  const totalH = labelBlockH + 12 + promptBlockH + 16 + alternativesBlockH;
  return { ...fallback, labelBlockH, promptBlockH, altHeights, alternativesBlockH, totalH };
}

function drawNotebookIcon(doc: jsPDF, x: number, y: number, color: [number, number, number]) {
  doc.setDrawColor(...color);
  doc.setLineWidth(1.2);
  doc.roundedRect(x + 3, y, 13, 16, 2, 2, "S");
  doc.line(x + 6, y + 4, x + 13, y + 4);
  doc.line(x + 6, y + 8, x + 13, y + 8);
  doc.line(x + 6, y + 12, x + 12, y + 12);
  doc.line(x + 1, y + 4, x + 4, y + 4);
  doc.line(x + 1, y + 8, x + 4, y + 8);
  doc.line(x + 1, y + 12, x + 4, y + 12);
}

function drawPdfAnswerContent(doc: jsPDF, q: QuestionRow, num: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const safe = PDF_SAFE_ANSWER;
  const safeW = pageW - safe.left - safe.right;
  const safeH = doc.internal.pageSize.getHeight() - safe.top - safe.bottom;

  const navy: [number, number, number] = [6, 36, 92];
  const navyText: [number, number, number] = [7, 31, 99];
  const gold: [number, number, number] = [255, 196, 0];
  const green: [number, number, number] = [19, 138, 54];
  const greenLight: [number, number, number] = [238, 248, 241];
  const red: [number, number, number] = [227, 27, 27];
  const borderBlue: [number, number, number] = [185, 215, 255];
  const borderGray: [number, number, number] = [217, 230, 247];

  const blockX = safe.left;
  const blockW = safeW;
  const answerFontSize = 10.2;
  const answerLineGap = 3.9;
  const altHeights = letterAlternatives(q).map((alt) => Math.max(78, 22 + measureTextHeight(doc, `${alt.letter}) ${alt.exp || "—"}`, blockW - 110, answerFontSize, 5, answerLineGap)));
  const mainH = 74 + altHeights.reduce((sum, h) => sum + h, 0) + (altHeights.length - 1) * 9 + 26;
  const startY = safe.top + Math.max((safeH - mainH) / 2, 0);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...borderBlue);
  doc.roundedRect(blockX, startY, blockW, mainH, 10, 10, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  const questionText = `QUESTÃO ${num}`;
  const boxW = 116;
  const boxH = 29;
  const gap = 14;
  const questionTextW = doc.getTextWidth(questionText);
  const rowW = questionTextW + gap + boxW;
  const rowX = pageW / 2 - rowW / 2;
  const rowY = startY + 38;

  doc.setTextColor(...navyText);
  doc.text(questionText, rowX, rowY);
  doc.setFillColor(...navy);
  doc.roundedRect(rowX + questionTextW + gap, startY + 18, boxW, boxH, 6, 6, "F");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("Gabarito:", rowX + questionTextW + gap + 16, startY + 37);
  doc.setFontSize(17);
  doc.setTextColor(...green);
  doc.text(q.correct, rowX + questionTextW + gap + 92, startY + 39);

  doc.setFontSize(12);
  doc.setTextColor(...navyText);
  doc.text("Explicação das alternativas", pageW / 2, startY + 72, { align: "center" });

  let cy = startY + 90;
  letterAlternatives(q).forEach((alt, index) => {
    const isCorrect = alt.letter === q.correct;
    const cardH = altHeights[index];
    doc.setFillColor(...(isCorrect ? greenLight : [255, 255, 255] as [number, number, number]));
    doc.setDrawColor(...(isCorrect ? [199, 227, 207] as [number, number, number] : borderGray));
    doc.roundedRect(blockX + 18, cy, blockW - 36, cardH, 8, 8, "FD");
    doc.setFillColor(...(isCorrect ? green : navy));
    doc.circle(blockX + 44, cy + 24, 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...(isCorrect ? [255, 255, 255] as [number, number, number] : gold));
    doc.text(alt.letter, blockX + 44, cy + 30, { align: "center" });
    const label = isCorrect ? "Correta: " : "Incorreta: ";
    const body = `${label}${alt.exp || "—"}`;
    const prefixColor = isCorrect ? green : red;
    drawWrappedTextWithColoredPrefix(doc, body, label, blockX + 72, cy + 18, blockW - 110, answerFontSize, prefixColor, navyText, 5, answerLineGap);
    cy += cardH + 9;
  });
}

function measureTextHeight(doc: jsPDF, text: string, maxWidth: number, size: number, maxLines?: number, lineGap = 3) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  const visible = typeof maxLines === "number" ? lines.slice(0, maxLines) : lines;
  return visible.length * (size + lineGap);
}

function drawWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, size: number, color: [number, number, number], weight: "normal" | "bold" = "normal", align: "left" | "center" = "left", maxLines?: number, lineGap = 3) {
  doc.setFont("helvetica", weight);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  const visible = typeof maxLines === "number" ? lines.slice(0, maxLines) : lines;
  visible.forEach((line, index) => doc.text(line, x, y + index * (size + lineGap), { align }));
  return y + visible.length * (size + lineGap);
}

function drawJustifiedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, size: number, color: [number, number, number], weight: "normal" | "bold" = "normal", lineGap = 3) {
  doc.setFont("helvetica", weight);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  lines.forEach((line, index) => {
    const lineY = y + index * (size + lineGap);
    const isLast = index === lines.length - 1;
    const words = line.trim().split(/\s+/);
    if (isLast || words.length < 2) {
      doc.text(line, x, lineY);
      return;
    }
    const wordsWidth = words.reduce((sum, word) => sum + doc.getTextWidth(word), 0);
    const gap = (maxWidth - wordsWidth) / (words.length - 1);
    let cursorX = x;
    words.forEach((word) => {
      doc.text(word, cursorX, lineY);
      cursorX += doc.getTextWidth(word) + gap;
    });
  });
  return y + lines.length * (size + lineGap);
}

function drawWrappedTextWithColoredPrefix(doc: jsPDF, text: string, prefix: string, x: number, y: number, maxWidth: number, size: number, prefixColor: [number, number, number], bodyColor: [number, number, number], maxLines: number, lineGap = 3) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  lines.slice(0, maxLines).forEach((line, index) => {
    const lineY = y + index * (size + lineGap);
    if (index === 0 && line.startsWith(prefix)) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...prefixColor);
      doc.text(prefix, x, lineY);
      const prefixWidth = doc.getTextWidth(prefix);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...bodyColor);
      doc.text(line.slice(prefix.length), x + prefixWidth, lineY);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...bodyColor);
      doc.text(line, x, lineY);
    }
  });
}
