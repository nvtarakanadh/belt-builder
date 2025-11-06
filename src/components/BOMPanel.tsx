import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";
import { BOMItem } from "@/types/conveyor";

interface BOMPanelProps {
  items: BOMItem[];
}

export const BOMPanel = ({ items }: BOMPanelProps) => {
  const totalCost = items.reduce((sum, item) => sum + item.totalCost, 0);

  return (
    <div className="panel-glass h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Bill of Materials</h2>
            <p className="text-sm text-muted-foreground mt-1">{items.length} components</p>
          </div>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export BOM
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1 h-full">
        <div className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Part #</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Unit $</TableHead>
                <TableHead className="text-right">Total $</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    <FileSpreadsheet className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    No components added yet
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className="hover:bg-secondary/50">
                    <TableCell className="font-mono text-xs">{item.partNumber}</TableCell>
                    <TableCell className="font-medium">{item.description}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.material}</TableCell>
                    <TableCell className="text-right">${item.unitCost.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-semibold">${item.totalCost.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {items.length > 0 && (
            <Card className="mt-4 p-4 bg-secondary/50">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-lg">Total Project Cost</span>
                <span className="text-2xl font-bold text-primary">${totalCost.toFixed(2)}</span>
              </div>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
