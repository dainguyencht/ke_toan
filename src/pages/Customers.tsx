import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContactList } from "@/components/contacts/ContactList";

export default function Customers() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Khách hàng & Nhà cung cấp</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Danh bạ và công nợ phải thu / phải trả
        </p>
      </div>

      <Tabs defaultValue="customer">
        <TabsList>
          <TabsTrigger value="customer">Khách hàng</TabsTrigger>
          <TabsTrigger value="supplier">Nhà cung cấp</TabsTrigger>
        </TabsList>
        <TabsContent value="customer">
          <ContactList kind="customer" />
        </TabsContent>
        <TabsContent value="supplier">
          <ContactList kind="supplier" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
