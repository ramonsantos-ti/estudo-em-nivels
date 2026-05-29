import {
  Document,
  Packer,
  Paragraph,
  TextRun,
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

  const children: any[] = [];

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

  children.push(...buildDocxQuestionPages(questions));

  const answerChildren: any[] = [];
  if (includeAnswers) answerChildren.push(...buildDocxAnswerPages(title, questions));

  const doc = new Document({
    creator: "Questão de Sucesso",
    title,
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1150, bottom: 1000, left: 850, right: 850 } },
        },
        headers: { default: bgHeader(bgQuestao) },
        children,
      },
      ...(includeAnswers
        ? [
            {
              properties: {
                page: { margin: { top: 1150, bottom: 1000, left: 850, right: 850 } },
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

function buildDocxQuestionPages(questions: QuestionRow[]): any[] {
  const children: any[] = [];

  questions.forEach((q, idx) => {
    if (idx > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    const num = questionNumber(q, idx);

    children.push(
      new Paragraph({ spacing: { before: 900, after: 160 }, children: [] }),
      new Table({
        width: { size: 86, type: WidthType.PERCENTAGE },
        alignment: AlignmentType.CENTER,
        borders: tableBorders(BORDER_BLUE),
        rows: [
          new TableRow({
            children: [
              new TableCell({
                verticalAlign: VerticalAlign.CENTER,
                margins: { top: 220, bottom: 220, left: 260, right: 260 },
                shading: { fill: WHITE },
                borders: tableBorders(BORDER_BLUE),
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 120 },
                    children: [new TextRun({ text: `QUESTÃO ${num}`, bold: true, size: 30, color: NAVY_TEXT })],
                  }),
                  ...(q.intro
                    ? [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 120 },
                          children: [new TextRun({ text: q.intro, size: 21, color: NAVY_TEXT })],
                        }),
                      ]
                    : []),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 180 },
                    children: [new TextRun({ text: q.command, bold: true, size: 22, color: NAVY_TEXT })],
                  }),
                  ...letterAlternatives(q).map((alt) => docxQuestionAlternative(alt)),
                ],
              }),
            ],
          }),
        ],
      }),
    );
  });

  return children;
}

function docxQuestionAlternative(alt: { letter: string; text: string }): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(BORDER_GRAY),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 12, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: NAVY },
            margins: { top: 90, bottom: 90, left: 80, right: 80 },
            borders: tableBorders(NAVY),
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: alt.letter, bold: true, color: GOLD, size: 22 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 88, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: WHITE },
            margins: { top: 90, bottom: 90, left: 130, right: 130 },
            borders: tableBorders(BORDER_GRAY),
            children: [
              new Paragraph({
                children: [new TextRun({ text: alt.text, color: NAVY_TEXT, size: 19 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function buildDocxAnswerPages(title: string, questions: QuestionRow[]): any[] {
  const children: any[] = [];

  questions.forEach((q, idx) => {
    if (idx > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    const num = questionNumber(q, idx);

    children.push(
      new Paragraph({ spacing: { before: 650, after: 160 }, children: [] }),
      new Table({
        width: { size: 86, type: WidthType.PERCENTAGE },
        alignment: AlignmentType.CENTER,
        borders: tableBorders(BORDER_BLUE),
        rows: [
          new TableRow({
            children: [
              new TableCell({
                verticalAlign: VerticalAlign.CENTER,
                margins: { top: 180, bottom: 180, left: 220, right: 220 },
                borders: tableBorders(BORDER_BLUE),
                shading: { fill: WHITE },
                children: [
                  docxAnswerSummary(q, num),
                  new Paragraph({ spacing: { after: 120 }, children: [] }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
                    children: [new TextRun({ text: `QUESTÃO ${num}`, bold: true, size: 28, color: NAVY_TEXT })],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 120 },
                    children: [
                      new TextRun({ text: "Gabarito: ", bold: true, size: 22, color: NAVY_TEXT }),
                      new TextRun({ text: q.correct, bold: true, size: 26, color: GREEN }),
                    ],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 130 },
                    children: [new TextRun({ text: "Explicação das alternativas", bold: true, size: 20, color: NAVY_TEXT })],
                  }),
                  ...letterAlternatives(q).map((alt) => docxAnswerAlternativeCard(alt, alt.letter === q.correct)),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 140 },
                    children: [new TextRun({ text: title, italics: true, size: 16, color: NAVY_TEXT })],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    );
  });

  return children;
}

function docxAnswerSummary(q: QuestionRow, num: number): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(BORDER_BLUE),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: LIGHT_BLUE },
            margins: { top: 130, bottom: 130, left: 160, right: 160 },
            borders: tableBorders(BORDER_BLUE),
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `◎ Questão ${num} — letra `, bold: true, size: 22, color: NAVY_TEXT }),
                  new TextRun({ text: q.correct, bold: true, size: 28, color: GREEN }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function docxAnswerAlternativeCard(alt: { letter: string; exp: string | null }, isCorrect: boolean): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(isCorrect ? "C7E3CF" : BORDER_GRAY),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 11, type: WidthType.PERCENTAGE },
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
            width: { size: 89, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            shading: { fill: isCorrect ? GREEN_LIGHT : WHITE },
            margins: { top: 90, bottom: 90, left: 110, right: 110 },
            borders: tableBorders(isCorrect ? "C7E3CF" : BORDER_GRAY),
            children: [
              new Paragraph({
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

  const [bgQuestao, bgGabarito] = await Promise.all([
    loadAsBase64(BG_QUESTAO_URL),
    loadAsBase64(BG_GABARITO_URL),
  ]);

  function drawBackground(kind: "questao" | "gabarito") {
    const data = kind === "questao" ? bgQuestao : bgGabarito;
    doc.addImage(`data:image/png;base64,${data}`, "PNG", 0, 0, pageW, pageH, undefined, "FAST");
  }

  // Cover
  drawBackground("questao");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(11, 30, 77);
  doc.text(title, pageW / 2, pageH / 2 + 40, { align: "center", maxWidth: pageW - 112 });

  questions.forEach((q, idx) => {
    doc.addPage();
    drawBackground("questao");
    drawPdfQuestionContent(doc, q, questionNumber(q, idx));
  });

  if (includeAnswers) {
    questions.forEach((q, idx) => {
      doc.addPage();
      drawBackground("gabarito");
      drawPdfAnswerContent(doc, title, q, questionNumber(q, idx));
    });
  }

  doc.save(`${slug(title)}.pdf`);
}

function drawPdfQuestionContent(doc: jsPDF, q: QuestionRow, num: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const navy: [number, number, number] = [6, 36, 92];
  const navyText: [number, number, number] = [7, 31, 99];
  const gold: [number, number, number] = [255, 196, 0];
  const borderBlue: [number, number, number] = [185, 215, 255];
  const borderGray: [number, number, number] = [217, 230, 247];

  const x = 76;
  const w = pageW - 152;
  const h = 560;
  const y = (pageH - h) / 2;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...borderBlue);
  doc.roundedRect(x, y, w, h, 10, 10, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...navyText);
  doc.text(`QUESTÃO ${num}`, pageW / 2, y + 38, { align: "center" });

  let cy = y + 78;
  if (q.intro) {
    cy = drawWrappedText(doc, q.intro, pageW / 2, cy, w - 64, 11, navyText, "normal", "center") + 12;
  }
  cy = drawWrappedText(doc, q.command, pageW / 2, cy, w - 64, 12, navyText, "bold", "center") + 18;

  letterAlternatives(q).forEach((alt) => {
    const cardH = 58;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...borderGray);
    doc.roundedRect(x + 32, cy, w - 64, cardH, 8, 8, "FD");

    doc.setFillColor(...navy);
    doc.circle(x + 56, cy + 21, 15, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(...gold);
    doc.text(alt.letter, x + 56, cy + 27, { align: "center" });

    drawWrappedText(doc, alt.text, x + 82, cy + 17, w - 126, 9.6, navyText, "normal", "left", 4);
    cy += cardH + 10;
  });
}

function drawPdfAnswerContent(doc: jsPDF, title: string, q: QuestionRow, num: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const navy: [number, number, number] = [6, 36, 92];
  const navyText: [number, number, number] = [7, 31, 99];
  const gold: [number, number, number] = [255, 196, 0];
  const green: [number, number, number] = [19, 138, 54];
  const greenLight: [number, number, number] = [238, 248, 241];
  const red: [number, number, number] = [227, 27, 27];
  const borderBlue: [number, number, number] = [185, 215, 255];
  const borderGray: [number, number, number] = [217, 230, 247];

  const x = 76;
  const w = pageW - 152;
  const h = 610;
  const y = (pageH - h) / 2;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...borderBlue);
  doc.roundedRect(x, y, w, h, 10, 10, "FD");

  doc.setFillColor(248, 251, 255);
  doc.setDrawColor(...borderBlue);
  doc.roundedRect(x + 32, y + 24, w - 64, 54, 8, 8, "FD");
  doc.setFillColor(...navy);
  doc.circle(x + 70, y + 51, 15, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("◎", x + 70, y + 56, { align: "center" });
  doc.setFontSize(16);
  doc.setTextColor(...navyText);
  doc.text(`Questão ${num} — letra`, x + 98, y + 57);
  doc.setFontSize(22);
  doc.setTextColor(...green);
  doc.text(q.correct, x + w - 72, y + 59);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...navyText);
  doc.text(`QUESTÃO ${num}`, pageW / 2, y + 118, { align: "center" });

  doc.setFillColor(...navy);
  doc.roundedRect(pageW / 2 - 58, y + 134, 116, 31, 6, 6, "F");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("Gabarito:", pageW / 2 - 42, y + 154);
  doc.setFontSize(17);
  doc.setTextColor(...green);
  doc.text(q.correct, pageW / 2 + 34, y + 156);

  doc.setFontSize(12);
  doc.setTextColor(...navyText);
  doc.text("Explicação das alternativas", pageW / 2, y + 190, { align: "center" });

  let cy = y + 212;
  letterAlternatives(q).forEach((alt) => {
    const isCorrect = alt.letter === q.correct;
    const cardH = 68;
    if (isCorrect) doc.setFillColor(...greenLight);
    else doc.setFillColor(255, 255, 255);
    if (isCorrect) doc.setDrawColor(199, 227, 207);
    else doc.setDrawColor(...borderGray);
    doc.roundedRect(x + 32, cy, w - 64, cardH, 8, 8, "FD");

    if (isCorrect) doc.setFillColor(...green);
    else doc.setFillColor(...navy);
    doc.circle(x + 58, cy + 25, 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    if (isCorrect) doc.setTextColor(255, 255, 255);
    else doc.setTextColor(...gold);
    doc.text(alt.letter, x + 58, cy + 31, { align: "center" });

    const label = isCorrect ? "Correta: " : "Incorreta: ";
    const body = `${label}${alt.exp || "—"}`;
    const color = isCorrect ? green : red;
    drawWrappedTextWithColoredPrefix(doc, body, label, x + 88, cy + 18, w - 142, 8.5, color, navyText, 5);
    cy += cardH + 10;
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...navyText);
  doc.text(title, pageW / 2, y + h - 22, { align: "center", maxWidth: w - 80 });
}

function drawWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color: [number, number, number],
  weight: "normal" | "bold" = "normal",
  align: "left" | "center" = "left",
  maxLines?: number,
) {
  doc.setFont("helvetica", weight);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  const visible = typeof maxLines === "number" ? lines.slice(0, maxLines) : lines;
  visible.forEach((line, index) => {
    doc.text(line, x, y + index * (size + 3), { align });
  });
  return y + visible.length * (size + 3);
}

function drawWrappedTextWithColoredPrefix(
  doc: jsPDF,
  text: string,
  prefix: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  prefixColor: [number, number, number],
  bodyColor: [number, number, number],
  maxLines: number,
) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  lines.slice(0, maxLines).forEach((line, index) => {
    if (index === 0 && line.startsWith(prefix)) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...prefixColor);
      doc.text(prefix, x, y);
      const prefixWidth = doc.getTextWidth(prefix);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...bodyColor);
      doc.text(line.slice(prefix.length), x + prefixWidth, y);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...bodyColor);
      doc.text(line, x, y + index * (size + 3));
    }
  });
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
