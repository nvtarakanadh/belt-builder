import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { ConveyorComponent } from "@/types/conveyor";
import { AdjustDimensions } from "@/components/AdjustDimensions";

interface PropertiesPanelProps {
  selectedComponent: ConveyorComponent | null;
  onUpdateComponent: (component: ConveyorComponent) => void;
}

export const PropertiesPanel = ({ selectedComponent, onUpdateComponent }: PropertiesPanelProps) => {
  if (!selectedComponent) {
    return (
      <div className="panel-glass h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Info className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Select a component to view properties</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-glass h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Properties</h2>
          <Badge variant="outline">{selectedComponent.type}</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{selectedComponent.name}</p>
      </div>
      
      <ScrollArea className="flex-1" style={{ height: '100%' }}>
        <div className="p-4">
          <Tabs defaultValue="specs">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="specs">Specs</TabsTrigger>
            <TabsTrigger value="alternatives">Options</TabsTrigger>
            <TabsTrigger value="position">Position</TabsTrigger>
            <TabsTrigger value="material">Material</TabsTrigger>
          </TabsList>

          <TabsContent value="specs" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Part Number</Label>
              <Input 
                value={selectedComponent.partNumber || ''} 
                placeholder="Enter part number"
                className="bg-secondary"
                readOnly
              />
            </div>

            <Separator />

            {/* Interactive Dimension Controls */}
            {(selectedComponent.dimensions.length || selectedComponent.dimensions.width) && (
              <AdjustDimensions
                selectedComponent={selectedComponent}
                onUpdateComponent={onUpdateComponent}
              />
            )}

            {/* Legacy dimension inputs for height and diameter (if needed) */}
            {selectedComponent.dimensions.height && (
              <div className="space-y-2">
                <Label>Height (mm)</Label>
                <Input 
                  type="number"
                  value={selectedComponent.dimensions.height} 
                  className="bg-secondary"
                  readOnly
                />
              </div>
            )}

            {selectedComponent.dimensions.diameter && (
              <div className="space-y-2">
                <Label>Diameter (mm)</Label>
                <Input 
                  type="number"
                  value={selectedComponent.dimensions.diameter} 
                  className="bg-secondary"
                  readOnly
                />
              </div>
            )}

            <Separator />

            {selectedComponent.type === 'motor' && (
              <>
                <div className="space-y-2">
                  <Label>Power (kW)</Label>
                  <Input 
                    type="number"
                    placeholder="2.2" 
                    className="bg-secondary"
                  />
                </div>
                <div className="space-y-2">
                  <Label>RPM</Label>
                  <Input 
                    type="number"
                    placeholder="1450" 
                    className="bg-secondary"
                  />
                </div>
              </>
            )}

            {selectedComponent.type === 'belt' && (
              <>
                <div className="space-y-2">
                  <Label>Belt Speed (m/s)</Label>
                  <Input 
                    type="number"
                    placeholder="1.5" 
                    className="bg-secondary"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Belt Type</Label>
                  <Select>
                    <SelectTrigger className="bg-secondary">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">Flat Belt</SelectItem>
                      <SelectItem value="modular">Modular Belt</SelectItem>
                      <SelectItem value="rubber">Rubber Belt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="alternatives" className="space-y-4 mt-4">
            <div className="space-y-3">
              <Label>Alternative Components</Label>
              <p className="text-xs text-muted-foreground">Select a different component to swap</p>
              
              {selectedComponent.type === 'motor' && (
                <div className="space-y-2">
                  <Card className="p-3 cursor-pointer hover:border-primary transition-smooth">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-sm">Standard Motor 1.5kW</h4>
                        <p className="text-xs text-muted-foreground mt-1">1450 RPM, IE2 Efficiency</p>
                        <Badge variant="outline" className="mt-2">$650</Badge>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-3 cursor-pointer hover:border-primary transition-smooth border-primary">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-sm">Drive Motor 2.2kW</h4>
                        <p className="text-xs text-muted-foreground mt-1">1450 RPM, IE3 Efficiency</p>
                        <Badge variant="outline" className="mt-2">$850</Badge>
                      </div>
                      <Badge className="bg-primary">Current</Badge>
                    </div>
                  </Card>
                  <Card className="p-3 cursor-pointer hover:border-primary transition-smooth">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-sm">High Power Motor 3.0kW</h4>
                        <p className="text-xs text-muted-foreground mt-1">1450 RPM, IE4 Efficiency</p>
                        <Badge variant="outline" className="mt-2">$1200</Badge>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-3 cursor-pointer hover:border-primary transition-smooth">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-sm">Variable Speed Motor 2.2kW</h4>
                        <p className="text-xs text-muted-foreground mt-1">Variable RPM, VFD Ready</p>
                        <Badge variant="outline" className="mt-2">$1500</Badge>
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {selectedComponent.type === 'belt' && (
                <div className="space-y-2">
                  <Card className="p-3 cursor-pointer hover:border-primary transition-smooth">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-sm">Standard Rubber Belt</h4>
                        <p className="text-xs text-muted-foreground mt-1">10m x 1.5m, 2-ply</p>
                        <Badge variant="outline" className="mt-2">$1800</Badge>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-3 cursor-pointer hover:border-primary transition-smooth border-primary">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-sm">Industrial Rubber Belt</h4>
                        <p className="text-xs text-muted-foreground mt-1">12m x 2m, 3-ply</p>
                        <Badge variant="outline" className="mt-2">$2500</Badge>
                      </div>
                      <Badge className="bg-primary">Current</Badge>
                    </div>
                  </Card>
                  <Card className="p-3 cursor-pointer hover:border-primary transition-smooth">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-sm">Heavy Duty Modular Belt</h4>
                        <p className="text-xs text-muted-foreground mt-1">12m x 2m, Plastic modular</p>
                        <Badge variant="outline" className="mt-2">$3800</Badge>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-3 cursor-pointer hover:border-primary transition-smooth">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-sm">Food Grade PU Belt</h4>
                        <p className="text-xs text-muted-foreground mt-1">12m x 2m, FDA approved</p>
                        <Badge variant="outline" className="mt-2">$4200</Badge>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="position" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>X Position (mm)</Label>
              <Input 
                type="number"
                value={selectedComponent.position[0]} 
                className="bg-secondary"
              />
            </div>
            <div className="space-y-2">
              <Label>Y Position (mm)</Label>
              <Input 
                type="number"
                value={selectedComponent.position[1]} 
                className="bg-secondary"
              />
            </div>
            <div className="space-y-2">
              <Label>Z Position (mm)</Label>
              <Input 
                type="number"
                value={selectedComponent.position[2]} 
                className="bg-secondary"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Rotation X (deg)</Label>
              <Input 
                type="number"
                value={selectedComponent.rotation[0]} 
                className="bg-secondary"
              />
            </div>
            <div className="space-y-2">
              <Label>Rotation Y (deg)</Label>
              <Input 
                type="number"
                value={selectedComponent.rotation[1]} 
                className="bg-secondary"
              />
            </div>
            <div className="space-y-2">
              <Label>Rotation Z (deg)</Label>
              <Input 
                type="number"
                value={selectedComponent.rotation[2]} 
                className="bg-secondary"
              />
            </div>
          </TabsContent>

          <TabsContent value="material" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Material</Label>
              <Select defaultValue={selectedComponent.material}>
                <SelectTrigger className="bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="steel">Structural Steel</SelectItem>
                  <SelectItem value="aluminum">Aluminum Alloy</SelectItem>
                  <SelectItem value="stainless">Stainless Steel</SelectItem>
                  <SelectItem value="plastic">Engineering Plastic</SelectItem>
                  <SelectItem value="rubber">Industrial Rubber</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Surface Finish</Label>
              <Select>
                <SelectTrigger className="bg-secondary">
                  <SelectValue placeholder="Select finish" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="powder">Powder Coated</SelectItem>
                  <SelectItem value="galvanized">Galvanized</SelectItem>
                  <SelectItem value="anodized">Anodized</SelectItem>
                  <SelectItem value="painted">Industrial Paint</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Unit Cost ($)</Label>
              <Input 
                type="number"
                value={selectedComponent.cost || 0} 
                className="bg-secondary"
              />
            </div>
          </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
};
