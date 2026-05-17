import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Wallet,
  BarChart3,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Tổng quan", icon: LayoutDashboard, title: "Dashboard - tổng quan hoạt động" },
  { to: "/products", label: "Sản phẩm", icon: Package, title: "Quản lý sản phẩm và tồn kho" },
  { to: "/orders", label: "Đơn hàng", icon: ShoppingCart, title: "Phiếu nhập, phiếu bán, đơn trả" },
  { to: "/customers", label: "Khách & NCC", icon: Users, title: "Khách hàng và Nhà cung cấp" },
  { to: "/cashbook", label: "Sổ quỹ", icon: Wallet, title: "Thu chi tiền mặt" },
  { to: "/reports", label: "Báo cáo", icon: BarChart3, title: "Doanh thu, lãi gộp, tồn kho, công nợ" },
  { to: "/settings", label: "Cài đặt", icon: SettingsIcon, title: "Cấu hình, backup, restore" },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-50 flex flex-col">
      <div className="h-14 flex items-center px-4 border-b border-neutral-200">
        <span className="font-semibold text-brand-700">Sổ Sách</span>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon, title }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={title}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm",
                "text-neutral-700 hover:bg-neutral-200/60",
                isActive && "bg-brand-100 text-brand-700 font-medium hover:bg-brand-100",
              )
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 text-xs text-neutral-400 border-t border-neutral-200">
        v0.1.0 - Local DB
      </div>
    </aside>
  );
}
