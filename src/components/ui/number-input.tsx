import * as React from "react";
import { Input } from "./input";

/** Chuỗi chữ số → định dạng nhóm hàng nghìn bằng dấu chấm: "1234567" → "1.234.567" */
function formatGroups(digits: string): string {
  const n = digits.replace(/^0+(?=\d)/, "");
  if (!n) return "";
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  /** Giá trị số (số nguyên — dùng cho tiền VND). */
  value: number;
  onChange: (value: number) => void;
};

/**
 * Ô nhập số tiền: hiển thị có dấu chấm ngăn cách hàng nghìn cho dễ đọc.
 * Chỉ nhận số nguyên (phù hợp tiền VND). Giữ vị trí con trỏ khi gõ.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, inputMode = "numeric", ...rest }, ref) => {
    const display = value ? formatGroups(String(Math.trunc(Math.abs(value)))) : "";

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const raw = input.value;
      const digits = raw.replace(/\D/g, "");
      const num = digits ? Number(digits) : 0;

      const cursor = input.selectionStart ?? raw.length;
      const digitsBeforeCursor = raw.slice(0, cursor).replace(/\D/g, "").length;

      onChange(num);

      // Khôi phục vị trí con trỏ sau khi format lại (đếm theo số chữ số bên trái)
      const formatted = formatGroups(digits);
      requestAnimationFrame(() => {
        let pos = 0;
        let seen = 0;
        while (pos < formatted.length && seen < digitsBeforeCursor) {
          if (/\d/.test(formatted[pos])) seen++;
          pos++;
        }
        try {
          input.setSelectionRange(pos, pos);
        } catch {
          // một số trình duyệt chặn setSelectionRange trên input không focus
        }
      });
    };

    return (
      <Input
        {...rest}
        ref={ref}
        type="text"
        inputMode={inputMode}
        value={display}
        onChange={handleChange}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";
