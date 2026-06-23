import { formatDateTime, formatNumber } from "@/lib/utils";
import type { OrderItem } from "@/domain/types";

type Props = {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  shopBank: string;
  orderDate: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: Array<
    OrderItem & { sku: string; product_name: string; base_unit: string }
  >;
  /** Tổng tiền hàng (= subtotal trước chiết khấu). Mặc định = orderTotal. */
  orderSubtotal?: number;
  /** Chiết khấu cho cả phiếu. Mặc định 0. */
  orderDiscount?: number;
  orderTotal: number;
  orderPaid: number;
  oldDebt: number;
  currentDebt: number;
  invoiceNote: string;
  /** Cỡ chữ base (px). Children scale theo em. Mặc định 15. */
  fontSize?: number;
};

export function InvoiceLayout({
  shopName,
  shopAddress,
  shopPhone,
  shopBank,
  orderDate,
  customerName,
  customerPhone,
  customerAddress,
  items,
  orderSubtotal,
  orderDiscount,
  orderTotal,
  orderPaid,
  oldDebt,
  currentDebt,
  invoiceNote,
  fontSize,
}: Props) {
  const subtotal = orderSubtotal ?? orderTotal;
  const discount = orderDiscount ?? 0;
  const hasDiscount = discount > 0;
  const displayItems = items;

  return (
    <div
      className="inv-wrap"
      style={fontSize ? { fontSize: `${fontSize}px` } : undefined}
    >
      {/* Header: shop name (nửa trái) + info (nửa phải, labels căn cột) */}
      <div className="inv-header">
        <div className="inv-shop-col">
          <div className="inv-shop">{shopName}</div>
        </div>
        <div className="inv-shop-meta">
          <table>
            <tbody>
              {shopAddress && (
                <tr>
                  <td className="inv-meta-label">Địa chỉ:</td>
                  <td className="inv-meta-val">{shopAddress}</td>
                </tr>
              )}
              {shopPhone && (
                <tr>
                  <td className="inv-meta-label">SĐT:</td>
                  <td className="inv-meta-val">{shopPhone}</td>
                </tr>
              )}
              {shopBank && (
                <tr>
                  <td className="inv-meta-label">STK:</td>
                  <td className="inv-meta-val">{shopBank}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tiêu đề */}
      <div className="inv-title-block">
        <div className="inv-title">HÓA ĐƠN BÁN HÀNG</div>
        <div className="inv-date">{formatDateTime(orderDate)}</div>
      </div>

      {/* Customer info: 3 dòng */}
      <table className="inv-customer-table">
        <tbody>
          <tr>
            <td className="inv-cust-label">Khách Hàng:</td>
            <td className="inv-cust-val">{customerName}</td>
          </tr>
          <tr>
            <td className="inv-cust-label">SĐT:</td>
            <td className="inv-cust-val">{customerPhone}</td>
          </tr>
          <tr>
            <td className="inv-cust-label">Địa chỉ:</td>
            <td className="inv-cust-val">{customerAddress}</td>
          </tr>
        </tbody>
      </table>

      {/* Items table — 12 dòng cố định */}
      <table className="inv-table">
        <colgroup>
          <col className="col-stt" />
          <col className="col-sku" />
          <col className="col-name" />
          <col className="col-unit" />
          <col className="col-qty" />
          <col className="col-conv" />
          <col className="col-price" />
          <col className="col-total" />
        </colgroup>
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã Sản Phẩm</th>
            <th>Sản Phẩm</th>
            <th>Đơn vị tính</th>
            <th>Số lượng</th>
            <th>Quy Đổi</th>
            <th>
              Đơn giá
              <br />
              (VNĐ)
            </th>
            <th>
              Thành tiền
              <br />
              (VNĐ)
            </th>
          </tr>
        </thead>
        <tbody>
          {displayItems.map((it, idx) => {
            const factor = it.unit_factor || 1;
            const qtyBase = it.qty * factor;
            const isConverted = it.unit_name !== it.base_unit;
            const pricePerBase = factor > 0 ? it.price / factor : it.price;
            return (
              <tr key={it.id}>
                <td className="center">{idx + 1}</td>
                <td>{it.sku}</td>
                <td>{it.product_name}</td>
                <td className="center">{it.base_unit}</td>
                <td className="num">{formatNumber(qtyBase)}</td>
                <td className="center">
                  {isConverted ? `${formatNumber(it.qty)} ${it.unit_name}` : ""}
                </td>
                <td className="num">{formatNumber(pricePerBase, 0)}</td>
                <td className="num">{formatNumber(it.total, 0)}</td>
              </tr>
            );
          })}
          <tr className="inv-total-row">
            <td colSpan={7}>Cộng tiền hàng:</td>
            <td className="num">{formatNumber(subtotal, 0)}</td>
          </tr>
          {hasDiscount && (
            <>
              <tr className="inv-total-row">
                <td colSpan={7}>Chiết khấu:</td>
                <td className="num">− {formatNumber(discount, 0)}</td>
              </tr>
              <tr className="inv-total-row">
                <td colSpan={7}>Tổng tiền sau giảm giá:</td>
                <td className="num">{formatNumber(orderTotal, 0)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      {/* Summary nợ */}
      <div className="inv-bottom-summary">
        <div className="sum-row">
          <span className="sum-label">Số nợ cũ của quý khách là:</span>
          <span className="sum-val">{formatNumber(oldDebt, 0)}</span>
        </div>
        <div className="sum-row">
          <span className="sum-label">Khách Thanh Toán:</span>
          <span className="sum-val">{formatNumber(orderPaid, 0)}</span>
        </div>
        <div className="sum-row">
          <span className="sum-label">Tổng nợ của quý khách là:</span>
          <span className="sum-val">{formatNumber(currentDebt, 0)}</span>
        </div>
        <div className="sum-row">
          <span className="sum-note">Lưu ý:</span>
          <span>{invoiceNote}</span>
        </div>
      </div>

      {/* Signatures: Khách Hàng | Kế Toán | Thủ Kho | Thủ Quỹ */}
      <table className="inv-signatures">
        <tbody>
          <tr>
            <td>
              <div className="inv-sig-title">Khách Hàng</div>
              <div className="inv-sig-sub">(Ký, Họ Tên)</div>
            </td>
            <td>
              <div className="inv-sig-title">Kế Toán</div>
              <div className="inv-sig-sub">(Ký, Họ Tên)</div>
            </td>
            <td>
              <div className="inv-sig-title">Thủ Kho</div>
              <div className="inv-sig-sub">(Ký, Họ Tên)</div>
            </td>
            <td>
              <div className="inv-sig-title">Thủ Quỹ</div>
              <div className="inv-sig-sub">(Ký, Họ Tên)</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
