import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  BorderStyle,
  Header,
  ImageRun,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
  Table,
  TableCell,
  TableRow,
  WidthType,
  VerticalAlign,
} from "docx";
import pkg from "file-saver";
const { saveAs } = pkg;
import jsPDF from "jspdf";

export type QuestionRow = {
  id: string;
  level: number;
  number: number | null;
  intro: string | null;
  command: string;
  alt_a: string;
  alt_b: string;
  alt_c: string;
  alt_d: string;
  alt_e: string;
  correct: string;
  exp_a: string | null;
  exp_b: string | null;
  exp_c: string | null;
  exp_d: string | null;
  exp_e: string | null;
  themes?: { name: string } | null;
  subthemes?: { name: string } | null;
};

const NAVY = "0B1E4D";
const NAVY_DEEP = "031842";
const NAVY_TEXT = "071F63";
const GOLD = "F2C300";
const GREEN = "138A36";
const GREEN_LIGHT = "EEF8F1";
const RED = "E31B1B";
const BORDER_BLUE = "B9D7FF";
const BORDER_GRAY = "D9E6F7";
const WHITE = "FFFFFF";

const BG_QUESTAO_URL = "/templates/bg-questao.png";
const BG_GABARITO_URL = "/templates/bg-gabarito.png";

async function loadAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function loadAsUint8(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  return new Uint8Array(await res.arrayBuffer());
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

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

/* ============================ DOCX ============================ */

export async function exportDocx(opts: {
  title: string;
  questions: QuestionRow[];
  includeAnswers: boolean;
}) {
  const { title, questions, includeAnswers } = opts;

  const [bgQuestao, bgGabarito] = await Promise.all([
    loadAsUint8(BG_QUESTAO_URL),
    loadAsUint8(BG_GABARITO_URL),
  ]);

  function bgHeader(data: Uint8Array): Header {
    return new Header({
      children: [
        new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data,
              transformation: { width: 595, height: 842 },
              floating: {
                horizontalPosition: {
                  relative: HorizontalPositionRelativeFrom.PAGE,
                  offset: 0,
                },
                verticalPosition: {
                  relative: VerticalPositionRelativeFrom.PAGE,
                  offset: 0,
                },
                behindDocument: true,
                wrap: { type: TextWrappingType.NONE },
              },
            }),
          ],
        }),
      ],
    });
  }

  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: "QUESTÃO DE SUCESSO", bold: true, size: 36, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [new TextRun({ text: "Questões comentadas para concursos", italics: true, size: 22, color: "555555" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: title, bold: true, size: 32, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [
        new TextRun({
          text: "Resolva primeiro. Entenda depois. Evolua sempre.",
          italics: true,
          size: 22,
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // Group by level
  const byLevel = [1, 2, 3, 4].map((lv) => ({
    level: lv,
    items: questions.filter((q) => q.level === lv),
  }));

  for (const group of byLevel) {
    if (group.items.length === 0) continue;
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 240 },
        children: [
          new TextRun({ text: `NÍVEL ${group.level}`, bold: true, size: 36, color: NAVY }),
        ],
      }),
      new Paragraph({
        spacing: { after: 360 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 1 } },
        children: [new TextRun({ text: levelDescription(group.level), italics: true })],
      }),
    );

    group.items.forEach((q, idx) => {
      const num = questionNumber(q, idx);
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({ text: `QUESTÃO ${num}`, bold: true, size: 28, color: NAVY }),
          ],
        }),
      );
      if (q.intro) {
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: q.intro })],
          }),
        );
      }
      children.push(
        new Paragraph({
          spacing: { after: 180 },
          children: [new TextRun({ text: q.command, bold: true })],
        }),
      );
      letterAlternatives(q).forEach((alt) => {
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            indent: { left: 360 },
            children: [
              new TextRun({ text: `${alt.letter}) `, bold: true, color: NAVY }),
              new TextRun({ text: alt.text }),
            ],
          }),
        );
      });
    });
  }

  const answerChildren: any[] = [];
  if (includeAnswers) {
    answerChildren.push(...buildDocxAnswerPages(title, questions));
  }

  const doc = new Document({
    creator: "Questão de Sucesso",
    title,
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 2400, bottom: 1400, left: 1200, right: 1200 } },
        },
        headers: { default: bgHeader(bgQuestao) },
        children,
      },
      ...(includeAnswers
        ? [
            {
              properties: {
                page: { margin: { top: 1200, bottom: 900, left: 650, right: 650 } },
              },
              headers: { default: bgHeader(bgGabarito) },
              children: answerChildren,
            },
          ]
        : []),
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${slug(title)}.docx`);
}

function buildDocxAnswerPages(title: string, questions: QuestionRow[]): any[] {
  const children: any[] = [];
  const pairs = chunk(questions, 2);

  pairs.forEach((pair, pairIndex) => {
    if (pairIndex > 0) children.push(new Paragraph({ children: [new PageBreak()] }));

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        shading: { fill: NAVY_DEEP },
        border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: GOLD, space: 1 } },
        children: [new TextRun({ text: "GABARITO COMENTADO", bold: true, size: 34, color: WHITE })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 260 },
        shading: { fill: NAVY_DEEP },
        children: [new TextRun({ text: title, bold: true, size: 18, color: GOLD })],
      }),
      docxSummaryTable(pair, pairIndex * 2),
      new Paragraph({ spacing: { after: 160 }, children: [] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorders(WHITE),
        rows: [
          new TableRow({
            children: [
              docxQuestionPanel(pair[0], questionNumber(pair[0], pairIndex * 2), 50),
              pair[1]
                ? docxQuestionPanel(pair[1], questionNumber(pair[1], pairIndex * 2 + 1), 50)
                : new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: tableBorders(WHITE),
                    children: [new Paragraph("")],
                  }),
            ],
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240 },
        children: [
          new TextRun({ text: "Questão de Sucesso — ", bold: true, color: NAVY_TEXT, size: 18 }),
          new TextRun({ text: "Resolva primeiro. Entenda depois. Evolua sempre.", color: NAVY_TEXT, size: 18 }),
        ],
      }),
    );
  });

  return children;
}

function docxSummaryTable(questions: QuestionRow[], startIndex: number): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(BORDER_BLUE),
    rows: [
      new TableRow({
        children: questions.map((q, index) =>
          new TableCell({
            width: { size: Math.floor(100 / questions.length), type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: WHITE },
            margins: { top: 140, bottom: 140, left: 160, right: 160 },
            borders: tableBorders(BORDER_BLUE),
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `◎ Questão ${questionNumber(q, startIndex + index)} — letra `, bold: true, size: 20, color: NAVY_TEXT }),
                  new TextRun({ text: q.correct, bold: true, size: 24, color: GREEN }),
                ],
              }),
            ],
          }),
        ),
      }),
    ],
  });
}

function docxQuestionPanel(q: QuestionRow, num: number, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 130, bottom: 130, left: 130, right: 130 },
    borders: tableBorders(BORDER_BLUE),
    shading: { fill: WHITE },
    children: [
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: `▤ QUESTÃO ${num}`, bold: true, color: NAVY_TEXT, size: 22 }),
          new TextRun({ text: "   Gabarito: ", bold: true, color: NAVY_TEXT, size: 18 }),
          new TextRun({ text: q.correct, bold: true, color: GREEN, size: 22 }),
        ],
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: "⌕ Explicação das alternativas", bold: true, color: NAVY_TEXT, size: 18 })],
      }),
      ...letterAlternatives(q).map((alt) => docxAlternativeCard(alt, alt.letter === q.correct)),
    ],
  });
}

function docxAlternativeCard(alt: { letter: string; exp: string | null }, isCorrect: boolean): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(isCorrect ? "C7E3CF" : BORDER_GRAY),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 14, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            shading: { fill: isCorrect ? GREEN : NAVY },
            margins: { top: 90, bottom: 90, left: 80, right: 80 },
            borders: tableBorders(isCorrect ? GREEN : NAVY),
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: alt.letter, bold: true, color: isCorrect ? WHITE : GOLD, size: 22 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 86, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            shading: { fill: isCorrect ? GREEN_LIGHT : WHITE },
            margins: { top: 90, bottom: 90, left: 110, right: 110 },
            borders: tableBorders(isCorrect ? "C7E3CF" : BORDER_GRAY),
            children: [
              new Paragraph({
                spacing: { after: 70 },
                children: [
                  new TextRun({ text: isCorrect ? "Correta: " : "Incorreta: ", bold: true, color: isCorrect ? GREEN : RED, size: 17 }),
                  new TextRun({ text: alt.exp || "—", color: NAVY_TEXT, size: 17 }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
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

/* ============================ PDF ============================ */

export async function exportPdf(opts: {
  title: string;
  questions: QuestionRow[];
  includeAnswers: boolean;
}) {
  const { title, questions, includeAnswers } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;
  const topMargin = 140;   // below the navy banner
  const bottomMargin = 90; // above the navy footer
  const contentW = pageW - margin * 2;
  let y = topMargin;
  let currentBg: "questao" | "gabarito" | null = null;

  const [bgQuestao, bgGabarito] = await Promise.all([
    loadAsBase64(BG_QUESTAO_URL),
    loadAsBase64(BG_GABARITO_URL),
  ]);

  const navy: [number, number, number] = [11, 30, 77];
  const gray: [number, number, number] = [90, 90, 90];

  function drawBackground() {
    if (!currentBg) return;
    const data = currentBg === "questao" ? bgQuestao : bgGabarito;
    doc.addImage(`data:image/png;base64,${data}`, "PNG", 0, 0, pageW, pageH, undefined, "FAST");
  }
  function newPage() {
    doc.addPage();
    drawBackground();
    y = topMargin;
  }
  function ensure(h: number) {
    if (y + h > pageH - bottomMargin) newPage();
  }
  function text(t: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number } = {}) {
    const { size = 11, bold = false, color = [30, 30, 30], indent = 0 } = opts;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(t, contentW - indent) as string[];
    for (const line of lines) {
      ensure(size + 4);
      doc.text(line, margin + indent, y);
      y += size + 4;
    }
  }

  // Cover (uses the QUESTÃO background as a hero)
  currentBg = "questao";
  drawBackground();
  y = pageH / 2 + 40;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...navy);
  doc.text(title, pageW / 2, y, { align: "center", maxWidth: contentW });

  // Questions by level
  for (const lv of [1, 2, 3, 4]) {
    const items = questions.filter((q) => q.level === lv);
    if (items.length === 0) continue;
    currentBg = "questao";
    newPage();
    text(`NÍVEL ${lv}`, { size: 20, bold: true, color: navy });
    y += 4;
    text(levelDescription(lv), { size: 10, color: gray });
    y += 12;

    items.forEach((q, idx) => {
      ensure(80);
      const num = questionNumber(q, idx);
      text(`QUESTÃO ${num}`, { size: 14, bold: true, color: navy });
      y += 4;
      if (q.intro) text(q.intro);
      text(q.command, { bold: true });
      y += 4;
      letterAlternatives(q).forEach((alt) => {
        text(`${alt.letter}) ${alt.text}`, { indent: 18 });
      });
      y += 10;
    });
  }

  // Answer key
  if (includeAnswers) {
    drawPdfAnswerPages(doc, title, questions);
  }

  doc.save(`${slug(title)}.pdf`);
}

function drawPdfAnswerPages(doc: jsPDF, title: string, questions: QuestionRow[]) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const pairs = chunk(questions, 2);

  const dark: [number, number, number] = [3, 24, 66];
  const navy: [number, number, number] = [6, 36, 92];
  const navyText: [number, number, number] = [7, 31, 99];
  const gold: [number, number, number] = [255, 196, 0];
  const green: [number, number, number] = [19, 138, 54];
  const greenLight: [number, number, number] = [238, 248, 241];
  const red: [number, number, number] = [227, 27, 27];
  const borderBlue: [number, number, number] = [185, 215, 255];
  const borderGray: [number, number, number] = [217, 230, 247];

  pairs.forEach((pair, pairIndex) => {
    doc.addPage();
    drawChrome(title);
    drawSummary(pair, pairIndex * 2);

    const panelY = 252;
    const gap = 18;
    const panelW = (pageW - 60 * 2 - gap) / 2;
    drawQuestionPanel(pair[0], questionNumber(pair[0], pairIndex * 2), 60, panelY, panelW);
    if (pair[1]) drawQuestionPanel(pair[1], questionNumber(pair[1], pairIndex * 2 + 1), 60 + panelW + gap, panelY, panelW);
  });

  function drawChrome(subject: string) {
    doc.setFillColor(...dark);
    doc.rect(0, 0, pageW, 126, "F");
    doc.setFillColor(...gold);
    doc.rect(0, 126, pageW, 4, "F");
    doc.triangle(pageW / 2 - 28, 130, pageW / 2 + 28, 130, pageW / 2, 150, "F");

    doc.setFillColor(255, 255, 255);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) doc.circle(24 + c * 11, 22 + r * 11, 1.8, "F");
    }
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) doc.circle(pageW - 54 + c * 11, 66 + r * 11, 1.8, "F");
    }

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(8);
    doc.circle(pageW - 88, 52, 34, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(48);
    doc.setTextColor(255, 255, 255);
    doc.text("✓", pageW - 101, 68);

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(3);
    doc.roundedRect(pageW / 2 - 23, 24, 46, 27, 4, 4, "S");
    doc.setDrawColor(...gold);
    doc.circle(pageW / 2 + 8, 22, 15, "S");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("✓", pageW / 2 + 2, 28);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.setTextColor(255, 255, 255);
    doc.text("GABARITO COMENTADO", pageW / 2, 75, { align: "center" });
    doc.setFontSize(10.5);
    doc.setTextColor(...gold);
    doc.text(subject, pageW / 2, 99, { align: "center", maxWidth: pageW - 160 });

    doc.setFillColor(...dark);
    doc.rect(0, pageH - 54, pageW, 54, "F");
    doc.setFillColor(...gold);
    doc.rect(0, pageH - 58, pageW, 4, "F");
    doc.setFillColor(...dark);
    doc.setDrawColor(...gold);
    doc.setLineWidth(3);
    doc.circle(pageW / 2, pageH - 58, 16, "FD");
    doc.setFontSize(14);
    doc.setTextColor(...gold);
    doc.text("★", pageW / 2, pageH - 53, { align: "center" });
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text("Questão de Sucesso — Estude por questões. Aprenda na prática. Seja aprovado.", pageW / 2, pageH - 30, { align: "center" });
    doc.text("Resolva primeiro. Entenda depois. Evolua sempre.", pageW / 2, pageH - 16, { align: "center" });
  }

  function drawSummary(pair: QuestionRow[], startIndex: number) {
    const x = 60;
    const y = 176;
    const w = pageW - 120;
    const h = 52;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...borderBlue);
    doc.roundedRect(x, y, w, h, 7, 7, "FD");
    const itemW = w / pair.length;

    pair.forEach((q, index) => {
      const ix = x + itemW * index;
      if (index > 0) {
        doc.setDrawColor(184, 184, 184);
        doc.line(ix, y + 11, ix, y + h - 11);
      }
      doc.setFillColor(...navy);
      doc.circle(ix + 36, y + h / 2, 14, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text("◎", ix + 36, y + h / 2 + 4, { align: "center" });
      doc.setTextColor(...navyText);
      doc.setFontSize(13);
      doc.text(`Questão ${questionNumber(q, startIndex + index)} — letra`, ix + 58, y + 31);
      doc.setFontSize(17);
      doc.setTextColor(...green);
      doc.text(q.correct, ix + itemW - 34, y + 32);
    });
  }

  function drawQuestionPanel(q: QuestionRow, num: number, x: number, y: number, w: number) {
    const panelH = 514;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...borderBlue);
    doc.roundedRect(x, y, w, panelH, 8, 8, "FD");

    doc.setFillColor(...navy);
    doc.circle(x + 22, y + 24, 13, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text("▤", x + 22, y + 28, { align: "center" });
    doc.setFontSize(15);
    doc.setTextColor(...navyText);
    doc.text(`QUESTÃO ${num}`, x + 42, y + 29);

    doc.setFillColor(...navy);
    doc.roundedRect(x + w - 88, y + 10, 74, 28, 5, 5, "F");
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text("Gabarito:", x + w - 80, y + 28);
    doc.setFontSize(15);
    doc.setTextColor(...green);
    doc.text(q.correct, x + w - 28, y + 29);

    doc.setFontSize(10.5);
    doc.setTextColor(...navyText);
    doc.text("⌕ Explicação das alternativas", x + 14, y + 60);

    let cy = y + 76;
    letterAlternatives(q).forEach((alt) => {
      drawAlternativeCard(alt, alt.letter === q.correct, x + 10, cy, w - 20, 80);
      cy += 86;
    });
  }

  function drawAlternativeCard(alt: { letter: string; exp: string | null }, isCorrect: boolean, x: number, y: number, w: number, h: number) {
    if (isCorrect) doc.setFillColor(...greenLight);
    else doc.setFillColor(255, 255, 255);
    if (isCorrect) doc.setDrawColor(199, 227, 207);
    else doc.setDrawColor(...borderGray);
    doc.roundedRect(x, y, w, h, 7, 7, "FD");

    if (isCorrect) doc.setFillColor(...green);
    else doc.setFillColor(...navy);
    doc.circle(x + 21, y + 23, 14, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    if (isCorrect) doc.setTextColor(255, 255, 255);
    else doc.setTextColor(...gold);
    doc.text(alt.letter, x + 21, y + 29, { align: "center" });

    const prefix = isCorrect ? "Correta: " : "Incorreta: ";
    const body = `${prefix}${alt.exp || "—"}`;
    const lines = doc.splitTextToSize(body, w - 55) as string[];
    doc.setFontSize(7.7);
    lines.slice(0, 7).forEach((line, index) => {
      doc.setFont("helvetica", index === 0 ? "bold" : "normal");
      if (index === 0) {
        if (isCorrect) doc.setTextColor(...green);
        else doc.setTextColor(...red);
      } else {
        doc.setTextColor(...navyText);
      }
      doc.text(line, x + 46, y + 17 + index * 9.2);
    });
  }
}

function levelDescription(level: number): string {
  switch (level) {
    case 1: return "Nível 1 — Primeiro contato. Lógica e conhecimento de mundo.";
    case 2: return "Nível 2 — Letra de lei e conceitos prontos.";
    case 3: return "Nível 3 — Aplicação multidisciplinar dos conhecimentos.";
    case 4: return "Nível 4 — Análise profunda, pegadinhas e doutrina.";
    default: return "";
  }
}

function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ebook";
}
