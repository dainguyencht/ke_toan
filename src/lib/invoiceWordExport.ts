/**
 * Build .docx của hoá đơn bằng docx library (OOXML programmatic).
 * Khác với HTML-based export, file tạo ra là docx thật, edit được hoàn hảo trong Word.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { formatDateTime, formatNumber } from "@/lib/utils";
import type { OrderItem } from "@/domain/types";

type Item = OrderItem & {
  sku: string;
  product_name: string;
  base_unit: string;
};

export type DocxInvoiceInput = {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  shopBank: string;
  orderDate: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: Item[];
  orderTotal: number;
  orderPaid: number;
  oldDebt: number;
  currentDebt: number;
  invoiceNote: string;
};

const BORDER_THIN = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "555555",
};
const BORDER_NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

const NO_BORDERS = {
  top: BORDER_NONE,
  bottom: BORDER_NONE,
  left: BORDER_NONE,
  right: BORDER_NONE,
};
const ALL_BORDERS = {
  top: BORDER_THIN,
  bottom: BORDER_THIN,
  left: BORDER_THIN,
  right: BORDER_THIN,
};

function pText(text: string, opts: Partial<{
  bold: boolean;
  italic: boolean;
  size: number;
  align: "start" | "end" | "center" | "both" | "left" | "right";
  spacingAfter: number;
}> = {}): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.spacingAfter ?? 0 },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italic,
        size: opts.size, // half-points
      }),
    ],
  });
}

function cell(
  paragraphs: Paragraph[],
  opts: Partial<{
    width: number; // percentage
    borders: typeof ALL_BORDERS | typeof NO_BORDERS;
    align: "top" | "center" | "bottom";
  }> = {},
): TableCell {
  return new TableCell({
    width: opts.width
      ? { size: opts.width, type: WidthType.PERCENTAGE }
      : undefined,
    borders: opts.borders ?? ALL_BORDERS,
    verticalAlign: opts.align ?? VerticalAlign.CENTER,
    children: paragraphs,
  });
}

export async function buildInvoiceDocxBlob(d: DocxInvoiceInput): Promise<Blob> {
  // === Header: 2-column table (tên shop | meta) ===
  const metaRows: TableRow[] = [];
  if (d.shopAddress) {
    metaRows.push(
      new TableRow({
        children: [
          cell(
            [pText("Địa chỉ:", { bold: true, size: 22 })],
            { borders: NO_BORDERS },
          ),
          cell([pText(d.shopAddress, { size: 22 })], { borders: NO_BORDERS }),
        ],
      }),
    );
  }
  if (d.shopPhone) {
    metaRows.push(
      new TableRow({
        children: [
          cell([pText("SĐT:", { bold: true, size: 22 })], {
            borders: NO_BORDERS,
          }),
          cell([pText(d.shopPhone, { size: 22 })], { borders: NO_BORDERS }),
        ],
      }),
    );
  }
  if (d.shopBank) {
    metaRows.push(
      new TableRow({
        children: [
          cell([pText("STK:", { bold: true, size: 22 })], {
            borders: NO_BORDERS,
          }),
          cell([pText(d.shopBank, { size: 22 })], { borders: NO_BORDERS }),
        ],
      }),
    );
  }
  const metaTable =
    metaRows.length > 0
      ? new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: BORDER_NONE,
            bottom: BORDER_NONE,
            left: BORDER_NONE,
            right: BORDER_NONE,
            insideHorizontal: BORDER_NONE,
            insideVertical: BORDER_NONE,
          },
          rows: metaRows,
        })
      : null;

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: BORDER_NONE,
      bottom: BORDER_NONE,
      left: BORDER_NONE,
      right: BORDER_NONE,
      insideHorizontal: BORDER_NONE,
      insideVertical: BORDER_NONE,
    },
    rows: [
      new TableRow({
        children: [
          cell(
            [
              new Paragraph({
                children: [
                  new TextRun({
                    text: d.shopName.toUpperCase(),
                    bold: true,
                    size: 28,
                  }),
                ],
              }),
            ],
            { width: 50, borders: NO_BORDERS, align: VerticalAlign.TOP },
          ),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.TOP,
            children: metaTable ? [metaTable] : [new Paragraph("")],
          }),
        ],
      }),
    ],
  });

  // === Title + date ===
  const title = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 50 },
    children: [
      new TextRun({ text: "HÓA ĐƠN BÁN HÀNG", bold: true, size: 32 }),
    ],
  });
  const dateP = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [
      new TextRun({ text: formatDateTime(d.orderDate), size: 20 }),
    ],
  });

  // === Customer info ===
  const customerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: BORDER_NONE,
      bottom: BORDER_NONE,
      left: BORDER_NONE,
      right: BORDER_NONE,
      insideHorizontal: BORDER_NONE,
      insideVertical: BORDER_NONE,
    },
    rows: [
      new TableRow({
        children: [
          cell([pText("Khách Hàng:", { bold: true, size: 22 })], {
            width: 18,
            borders: NO_BORDERS,
          }),
          cell([pText(d.customerName || "", { size: 22 })], {
            borders: NO_BORDERS,
          }),
        ],
      }),
      new TableRow({
        children: [
          cell([pText("SĐT:", { bold: true, size: 22 })], {
            width: 18,
            borders: NO_BORDERS,
          }),
          cell([pText(d.customerPhone || "", { size: 22 })], {
            borders: NO_BORDERS,
          }),
        ],
      }),
      new TableRow({
        children: [
          cell([pText("Địa chỉ:", { bold: true, size: 22 })], {
            width: 18,
            borders: NO_BORDERS,
          }),
          cell([pText(d.customerAddress || "", { size: 22 })], {
            borders: NO_BORDERS,
          }),
        ],
      }),
    ],
  });

  // === Items table ===
  const headerCells = [
    "STT",
    "Mã Sản Phẩm",
    "Sản Phẩm",
    "ĐVT",
    "Số lượng",
    "Quy Đổi",
    "Đơn giá (VNĐ)",
    "Thành tiền (VNĐ)",
  ].map((t) =>
    cell([pText(t, { bold: true, size: 20, align: AlignmentType.CENTER })], {
      align: VerticalAlign.CENTER,
    }),
  );
  const itemsHeaderRow = new TableRow({
    children: headerCells,
    tableHeader: true,
  });

  const itemRows = d.items.map((it, idx) => {
    const factor = it.unit_factor || 1;
    const qtyBase = it.qty * factor;
    const isConverted = it.unit_name !== it.base_unit;
    const pricePerBase = factor > 0 ? it.price / factor : it.price;
    return new TableRow({
      children: [
        cell([pText(String(idx + 1), { size: 20, align: AlignmentType.CENTER })]),
        cell([pText(it.sku, { size: 20 })]),
        cell([pText(it.product_name, { size: 20 })]),
        cell([pText(it.base_unit, { size: 20, align: AlignmentType.CENTER })]),
        cell([
          pText(formatNumber(qtyBase), { size: 20, align: AlignmentType.RIGHT }),
        ]),
        cell([
          pText(
            isConverted ? `${formatNumber(it.qty)} ${it.unit_name}` : "",
            { size: 20, align: AlignmentType.CENTER },
          ),
        ]),
        cell([
          pText(formatNumber(pricePerBase, 0), {
            size: 20,
            align: AlignmentType.RIGHT,
          }),
        ]),
        cell([
          pText(formatNumber(it.total, 0), {
            size: 20,
            align: AlignmentType.RIGHT,
          }),
        ]),
      ],
    });
  });

  const totalRow = new TableRow({
    children: [
      new TableCell({
        columnSpan: 7,
        borders: ALL_BORDERS,
        verticalAlign: VerticalAlign.CENTER,
        children: [
          pText("Cộng tiền hàng:", {
            bold: true,
            size: 20,
            align: AlignmentType.RIGHT,
          }),
        ],
      }),
      cell([
        pText(formatNumber(d.orderTotal, 0), {
          bold: true,
          size: 20,
          align: AlignmentType.RIGHT,
        }),
      ]),
    ],
  });

  const itemsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: [500, 1300, 2300, 1100, 900, 1000, 1300, 1600],
    rows: [itemsHeaderRow, ...itemRows, totalRow],
  });

  // === Summary ===
  const summary: Paragraph[] = [
    sumLineParagraph("Số nợ cũ của quý khách là:", formatNumber(d.oldDebt, 0)),
    sumLineParagraph("Khách Thanh Toán:", formatNumber(d.orderPaid, 0)),
    sumLineParagraph(
      "Tổng nợ của quý khách là:",
      formatNumber(d.currentDebt, 0),
    ),
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({ text: "Lưu ý: ", bold: true, size: 22 }),
        new TextRun({ text: d.invoiceNote || "", size: 22 }),
      ],
    }),
  ];

  // === Signatures ===
  const sigCell = (title: string) =>
    cell(
      [
        pText(title, {
          bold: true,
          size: 22,
          align: AlignmentType.CENTER,
        }),
        pText("(Ký, Họ Tên)", {
          italic: true,
          size: 20,
          align: AlignmentType.CENTER,
        }),
        new Paragraph({ spacing: { after: 600 }, children: [new TextRun("")] }),
      ],
      { width: 25, borders: NO_BORDERS, align: VerticalAlign.TOP },
    );

  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: BORDER_NONE,
      bottom: BORDER_NONE,
      left: BORDER_NONE,
      right: BORDER_NONE,
      insideHorizontal: BORDER_NONE,
      insideVertical: BORDER_NONE,
    },
    rows: [
      new TableRow({
        children: [
          sigCell("Khách Hàng"),
          sigCell("Kế Toán"),
          sigCell("Thủ Kho"),
          sigCell("Thủ Quỹ"),
        ],
      }),
    ],
  });

  // === Assemble document ===
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Tahoma", size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5 inch = 720 twips
          },
        },
        children: [
          headerTable,
          new Paragraph({ children: [new TextRun("")] }),
          title,
          dateP,
          customerTable,
          new Paragraph({ children: [new TextRun("")] }),
          itemsTable,
          new Paragraph({ children: [new TextRun("")] }),
          ...summary,
          new Paragraph({ children: [new TextRun("")] }),
          signatureTable,
        ],
      },
    ],
  });

  // docx exports a Blob in browser
  return await Packer.toBlob(doc);
}

function sumLineParagraph(label: string, value: string): Paragraph {
  // Dùng tab stops để căn phải value
  return new Paragraph({
    spacing: { after: 60 },
    tabStops: [{ type: "right", position: 9000 }],
    children: [
      new TextRun({ text: label, bold: true, size: 22 }),
      new TextRun({ text: "\t", size: 22 }),
      new TextRun({ text: value, size: 22 }),
    ],
  });
}
