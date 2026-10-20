import type { Metadata } from "next";
import { NewWarehouseItemForm } from "@/components/forms/NewWarehouseItemForm";
import { ReceiveStockForm } from "@/components/forms/ReceiveStockForm";
import { StockTable } from "@/components/inventory/StockTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getWarehousePage } from "@/viewmodels/warehouse.viewmodel";

export const metadata: Metadata = { title: "Warehouse" };

export default async function WarehousePage() {
  const { stock, materials } = await getWarehousePage();

  return (
    <>
      <PageHeader title="Warehouse stock" subtitle="All material held centrally under the Super Admin" />
      <Card title="Current inventory">
        <StockTable stock={stock} showUsed={false} />
      </Card>
      <Card title="Receive stock of an existing item">
        <ReceiveStockForm materials={materials} />
      </Card>
      <Card title="Add a new item">
        <NewWarehouseItemForm />
      </Card>
    </>
  );
}
