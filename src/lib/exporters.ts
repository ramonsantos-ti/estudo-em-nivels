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
  HorizontalPositionAlign,
  VerticalPositionAlign,
  TextWrappingType,
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
const GOLD = "F2C300";

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
      const num = q.number ?? idx + 1;
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

  if (includeAnswers) {
    const answerChildren: Paragraph[] = [];
    questions.forEach((q, idx) => {
      const num = q.number ?? idx + 1;
      answerChildren.push(
        new Paragraph({
          spacing: { before: 240, after: 80 },
          children: [
            new TextRun({ text: `QUESTÃO ${num} — Gabarito: `, bold: true, size: 26, color: NAVY }),
            new TextRun({ text: q.correct, bold: true, size: 26, color: "1B7F3B" }),
          ],
        }),
      );
      letterAlternatives(q).forEach((alt) => {
        const isCorrect = alt.letter === q.correct;
        answerChildren.push(
          new Paragraph({
            spacing: { after: 80 },
            indent: { left: 360 },
            children: [
              new TextRun({ text: `${alt.letter}) `, bold: true, color: NAVY }),
              new TextRun({
                text: isCorrect ? "Correta: " : "Incorreta: ",
                bold: true,
                color: isCorrect ? "1B7F3B" : "C0392B",
              }),
              new TextRun({ text: alt.exp || "—" }),
            ],
          }),
        );
      });
    });
    (exportDocx as any)._answerChildren = answerChildren;
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
                page: { margin: { top: 2400, bottom: 1400, left: 1200, right: 1200 } },
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

/* ============================ PDF ============================ */

export function exportPdf(opts: {
  title: string;
  questions: QuestionRow[];
  includeAnswers: boolean;
}) {
  const { title, questions, includeAnswers } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const navy: [number, number, number] = [11, 30, 77];
  const gold: [number, number, number] = [242, 195, 0];
  const green: [number, number, number] = [27, 127, 59];
  const red: [number, number, number] = [192, 57, 43];

  function newPage() {
    doc.addPage();
    y = margin;
    drawHeaderBar();
  }
  function ensure(h: number) {
    if (y + h > pageH - margin) newPage();
  }
  function drawHeaderBar() {
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageW, 24, "F");
    doc.setFillColor(...gold);
    doc.rect(0, 24, pageW, 3, "F");
    y = Math.max(y, 44);
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

  // Cover
  drawHeaderBar();
  y = pageH / 2 - 80;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...navy);
  doc.text("QUESTÃO DE SUCESSO", pageW / 2, y, { align: "center" });
  y += 30;
  doc.setFontSize(12);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(80, 80, 80);
  doc.text("Questões comentadas para concursos", pageW / 2, y, { align: "center" });
  y += 60;
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...navy);
  doc.text(title, pageW / 2, y, { align: "center", maxWidth: contentW });
  y += 40;
  doc.setFontSize(11);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(80, 80, 80);
  doc.text("Resolva primeiro. Entenda depois. Evolua sempre.", pageW / 2, y, { align: "center" });

  // Questions by level
  for (const lv of [1, 2, 3, 4]) {
    const items = questions.filter((q) => q.level === lv);
    if (items.length === 0) continue;
    newPage();
    text(`NÍVEL ${lv}`, { size: 20, bold: true, color: navy });
    y += 4;
    text(levelDescription(lv), { size: 10, color: [90, 90, 90] });
    y += 12;

    items.forEach((q, idx) => {
      ensure(80);
      const num = q.number ?? idx + 1;
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
    newPage();
    text("GABARITO COMENTADO", { size: 20, bold: true, color: navy });
    y += 10;
    questions.forEach((q, idx) => {
      ensure(80);
      const num = q.number ?? idx + 1;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...navy);
      const header = `QUESTÃO ${num} — Gabarito: `;
      ensure(20);
      doc.text(header, margin, y);
      const w = doc.getTextWidth(header);
      doc.setTextColor(...green);
      doc.text(q.correct, margin + w, y);
      y += 18;
      letterAlternatives(q).forEach((alt) => {
        const isCorrect = alt.letter === q.correct;
        const prefix = `${alt.letter}) ${isCorrect ? "Correta: " : "Incorreta: "}`;
        const body = alt.exp || "—";
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...(isCorrect ? green : red));
        const lines = doc.splitTextToSize(prefix + body, contentW - 18) as string[];
        for (let i = 0; i < lines.length; i++) {
          ensure(15);
          if (i === 0) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...(isCorrect ? green : red));
          } else {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(40, 40, 40);
          }
          doc.text(lines[i], margin + 18, y);
          y += 15;
        }
        y += 2;
      });
      y += 8;
    });
  }

  doc.save(`${slug(title)}.pdf`);
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