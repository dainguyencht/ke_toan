import { Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Orders from "@/pages/Orders";
import Customers from "@/pages/Customers";
import CashBook from "@/pages/CashBook";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import PrintInvoice from "@/pages/PrintInvoice";

export default function App() {
  const loc = useLocation();
  if (loc.pathname.startsWith("/print-invoice")) {
    return (
      <Routes>
        <Route path="/print-invoice" element={<PrintInvoice />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell h-full flex">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/cashbook" element={<CashBook />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
