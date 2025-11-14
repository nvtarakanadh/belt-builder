import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Info, Trash2 } from "lucide-react";
import { ConveyorComponent } from "@/types/conveyor";
import { AdjustDimensions } from "@/components/AdjustDimensions";
import { useState, useEffect } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ComponentPreview } from "@/components/ComponentPreview";

interface PropertiesPanelProps {
  selectedComponent: ConveyorComponent | null;
  onUpdateComponent: (component: ConveyorComponent) => void;
  onDeleteComponent?: (id: string) => void;
}

// Conveyor Dimensions Component with auto-calculation
function ConveyorDimensions({ 
  selectedComponent, 
  onUpdateComponent 
}: { 
  selectedComponent: ConveyorComponent; 
  onUpdateComponent: (component: ConveyorComponent) => void;
}) {
  const conveyorType = selectedComponent.specifications?.conveyorType || '';
  
  // Get L and N from specifications or dimensions
  const getNumericValue = (value: string | number | undefined): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value) || 0;
    return 0;
  };

  const [axisLength, setAxisLength] = useState<number>(
    getNumericValue(selectedComponent.specifications?.axisLength) || 
    getNumericValue(selectedComponent.dimensions.length) || 0
  );
  const [beltWidth, setBeltWidth] = useState<number>(
    getNumericValue(selectedComponent.specifications?.beltWidth) || 
    getNumericValue(selectedComponent.dimensions.width) || 0
  );

  // Calculate D and R based on formulas
  const calculateTotalLength = (L: number): number => {
    if (!conveyorType || L === 0) return 0;
    switch (conveyorType) {
      case 'DPS50':
        return L + 55;
      case 'DPS60':
        return L + 70;
      case 'DPS96':
        return L + 100;
      default:
        return 0;
    }
  };

  const calculateConveyorWidth = (N: number): number => {
    if (N === 0) return 0;
    return N + 67; // Fixed for all models
  };

  const totalLength = calculateTotalLength(axisLength);
  const conveyorWidth = calculateConveyorWidth(beltWidth);

  // Sync state with selectedComponent when it changes externally
  useEffect(() => {
    const currentAxisLength = getNumericValue(selectedComponent.specifications?.axisLength) || 
                              getNumericValue(selectedComponent.dimensions.length) || 0;
    const currentBeltWidth = getNumericValue(selectedComponent.specifications?.beltWidth) || 
                             getNumericValue(selectedComponent.dimensions.width) || 0;
    
    if (currentAxisLength !== axisLength) {
      setAxisLength(currentAxisLength);
    }
    if (currentBeltWidth !== beltWidth) {
      setBeltWidth(currentBeltWidth);
    }
  }, [selectedComponent.specifications?.axisLength, selectedComponent.specifications?.beltWidth, 
      selectedComponent.dimensions.length, selectedComponent.dimensions.width]);

  // Update component when L or N changes (debounced to prevent excessive updates)
  useEffect(() => {
    const currentAxisLength = getNumericValue(selectedComponent.specifications?.axisLength) || 
                              getNumericValue(selectedComponent.dimensions.length) || 0;
    const currentBeltWidth = getNumericValue(selectedComponent.specifications?.beltWidth) || 
                             getNumericValue(selectedComponent.dimensions.width) || 0;

    // Only update if values actually changed and are different from current
    if ((axisLength !== currentAxisLength || beltWidth !== currentBeltWidth) && 
        (axisLength > 0 || beltWidth > 0)) {
      const timeoutId = setTimeout(() => {
        onUpdateComponent({
          ...selectedComponent,
          specifications: {
            ...selectedComponent.specifications,
            axisLength,
            beltWidth,
            totalLength,
            conveyorWidth
          },
          dimensions: {
            ...selectedComponent.dimensions,
            length: totalLength,
            width: conveyorWidth
          }
        });
      }, 300); // Debounce updates

      return () => clearTimeout(timeoutId);
    }
  }, [axisLength, beltWidth]);

  return (
    <div className="space-y-4">
      {/* Axis to axis length (L) - User input */}
      <div className="space-y-2">
        <Label>1) Axis to axis length (L) =</Label>
        <div className="flex items-center gap-2">
          <Input 
            type="number"
            value={axisLength > 0 ? axisLength.toString() : ''} 
            placeholder="Enter length"
            className="bg-background"
            onChange={(e) => {
              const value = parseFloat(e.target.value) || 0;
              setAxisLength(value);
            }}
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">mm.</span>
          <Badge variant="outline" className="text-xs">User input</Badge>
        </div>
      </div>

      {/* Total length of Conveyor (D) - From backend (calculated) */}
      <div className="space-y-2">
        <Label>2) Total length of Conveyor (D) =</Label>
        <div className="flex items-center gap-2">
          <Input 
            type="number"
            value={totalLength > 0 ? totalLength.toString() : ''} 
            placeholder="Auto-calculated"
            className="bg-secondary"
            readOnly
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">mm.</span>
          <Badge variant="outline" className="text-xs bg-muted">From backend</Badge>
        </div>
      </div>

      {/* Belt Width (N) - User input */}
      <div className="space-y-2">
        <Label>3) Belt Width (N) =</Label>
        <div className="flex items-center gap-2">
          <Input 
            type="number"
            value={beltWidth > 0 ? beltWidth.toString() : ''} 
            placeholder="Enter width"
            className="bg-background"
            onChange={(e) => {
              const value = parseFloat(e.target.value) || 0;
              setBeltWidth(value);
            }}
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">mm.</span>
          <Badge variant="outline" className="text-xs">User input</Badge>
        </div>
      </div>

      {/* Conveyor Width (R) - From backend (calculated) */}
      <div className="space-y-2">
        <Label>4) Conveyor Width (R) =</Label>
        <div className="flex items-center gap-2">
          <Input 
            type="number"
            value={conveyorWidth > 0 ? conveyorWidth.toString() : ''} 
            placeholder="Auto-calculated"
            className="bg-secondary"
            readOnly
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">mm.</span>
          <Badge variant="outline" className="text-xs bg-muted">From backend</Badge>
        </div>
      </div>

      <Separator />

      {/* Instruction text */}
      <p className="text-xs text-muted-foreground">
        Consider Length and width Limitations from The PPT. and user can be only able to enter length(L) and width(N) and other 2 has to automatically populated.
      </p>

      {/* Note with calculation formulas */}
      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
        <p className="text-xs font-semibold text-destructive mb-2">Note:</p>
        <div className="text-xs text-destructive space-y-1">
          <p>• D = L + 55 fixed for DPS50</p>
          <p>• D = L + 70 fixed for DPS60</p>
          <p>• D = L + 100 fixed for DPS96</p>
          <p>• R = N + 67 Fixed for all the models</p>
        </div>
      </div>
    </div>
  );
}

export const PropertiesPanel = ({ selectedComponent, onUpdateComponent, onDeleteComponent }: PropertiesPanelProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
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

  // Debug: Log component type (remove after verification)
  const isBelt = selectedComponent.type?.toLowerCase() === 'belt';
  if (isBelt) {
    console.log('🔵 Belt component detected:', selectedComponent.type, selectedComponent.name);
  }

  return (
    <div className="panel-glass flex flex-col">
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-lg">Properties</h2>
          <Badge variant="outline">{selectedComponent.type}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{selectedComponent.name}</p>
          {onDeleteComponent && (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (selectedComponent?.id) {
                    setShowDeleteDialog(true);
                  }
                }}
                className="h-8"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
              {selectedComponent && (
                <ConfirmDialog
                  open={showDeleteDialog}
                  onOpenChange={setShowDeleteDialog}
                  title="Delete Component"
                  description={`Are you sure you want to delete "${selectedComponent.name}"? This action cannot be undone.`}
                  confirmText="Delete"
                  cancelText="Cancel"
                  onConfirm={() => {
                    if (selectedComponent?.id) {
                      onDeleteComponent(selectedComponent.id);
                    }
                  }}
                  variant="destructive"
                />
              )}
            </>
          )}
        </div>
        {/* Show processing error if component failed */}
        {selectedComponent.processing_status === 'failed' && selectedComponent.processing_error && (
          <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm font-semibold text-destructive mb-1">⚠️ Processing Failed</p>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap mb-2">{selectedComponent.processing_error}</p>
            <p className="text-xs text-muted-foreground">
              <strong>Solution:</strong> Delete this component and upload a converted STL or OBJ file instead of STEP.
            </p>
          </div>
        )}
      </div>

      {/* Component Preview */}
      <div className="p-4 border-b border-border">
        <Label className="text-sm font-semibold mb-2 block">Preview</Label>
        <ComponentPreview component={selectedComponent} />
      </div>

      {/* Conveyor Type Selection - At the top for belt components */}
      {selectedComponent.type?.toLowerCase() === 'belt' && (
        <div className="p-4 border-b border-border bg-secondary/30">
          <div className="space-y-3">
            <Label className="text-sm font-semibold">TYPE OF CONVEYOR</Label>
            <p className="text-xs text-destructive">Any one can be selected and others should be freeze.</p>
            
            <div className="grid grid-cols-3 gap-2">
              {['DPS50', 'DPS60', 'DPS96'].map((type) => {
                const isSelected = selectedComponent.specifications?.conveyorType === type;
                const isDisabled = selectedComponent.specifications?.conveyorType && 
                                  selectedComponent.specifications?.conveyorType !== type;
                
                return (
                  <div 
                    key={type}
                    className={`flex items-center gap-2 p-2 rounded-md border transition-colors cursor-pointer ${
                      isSelected 
                        ? 'border-primary bg-primary/10' 
                        : isDisabled
                        ? 'border-border/50 bg-muted/30 opacity-60 cursor-not-allowed'
                        : 'border-border hover:border-primary/50 hover:bg-secondary'
                    }`}
                    onClick={() => {
                      if (!isDisabled) {
                        onUpdateComponent({
                          ...selectedComponent,
                          specifications: {
                            ...selectedComponent.specifications,
                            conveyorType: isSelected ? undefined : type
                          }
                        });
                      }
                    }}
                  >
                    <div className={`flex items-center justify-center w-4 h-4 border-2 rounded ${
                      isSelected 
                        ? 'border-destructive' 
                        : isDisabled
                        ? 'border-muted-foreground/30'
                        : 'border-border'
                    }`}>
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-destructive" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <Label className={`cursor-pointer text-xs ${isDisabled ? 'text-muted-foreground' : ''}`}>
                      {type}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      <div className="flex-1 min-h-0">
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
            {(selectedComponent.dimensions.length || selectedComponent.dimensions.width || selectedComponent.dimensions.height) && (
              <AdjustDimensions
                selectedComponent={selectedComponent}
                onUpdateComponent={onUpdateComponent}
              />
            )}

            {/* Legacy dimension inputs for diameter (if needed) */}

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

            {selectedComponent.type?.toLowerCase() === 'belt' && (
              <>
                <Separator />
                
                {/* Conveyor Configuration Tabs */}
                <div className="space-y-4">
                  <Tabs defaultValue="dimensions" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-secondary">
                      <TabsTrigger value="dimensions" className="text-xs">CONVEYOR DIMENSIONS</TabsTrigger>
                      <TabsTrigger value="sideguide" className="text-xs">SIDE GUIDE</TabsTrigger>
                    </TabsList>

                    <TabsContent value="dimensions" className="space-y-4 mt-4">
                      <ConveyorDimensions 
                        selectedComponent={selectedComponent}
                        onUpdateComponent={onUpdateComponent}
                      />
                    </TabsContent>

                    <TabsContent value="sideguide" className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>Side Guide Configuration</Label>
                        <p className="text-xs text-muted-foreground">Configure side guide settings for the conveyor.</p>
                        <Select 
                          value={typeof selectedComponent.specifications?.sideGuide === 'string' 
                            ? selectedComponent.specifications.sideGuide 
                            : 'none'}
                          onValueChange={(value) => {
                            onUpdateComponent({
                              ...selectedComponent,
                              specifications: {
                                ...selectedComponent.specifications,
                                sideGuide: value
                              }
                            });
                          }}
                        >
                          <SelectTrigger className="bg-secondary">
                            <SelectValue placeholder="Select side guide" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Side Guide</SelectItem>
                            <SelectItem value="left">Left Side Only</SelectItem>
                            <SelectItem value="right">Right Side Only</SelectItem>
                            <SelectItem value="both">Both Sides</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Belt Speed (m/s)</Label>
                  <Input 
                    type="number"
                    placeholder="1.5" 
                    className="bg-secondary"
                  />
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

              {selectedComponent.type?.toLowerCase() === 'belt' && (
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
                value={selectedComponent.position[0].toString()} 
                className="bg-secondary"
              />
            </div>
            <div className="space-y-2">
              <Label>Y Position (mm)</Label>
              <Input 
                type="number"
                value={selectedComponent.position[1].toString()} 
                className="bg-secondary"
              />
            </div>
            <div className="space-y-2">
              <Label>Z Position (mm)</Label>
              <Input 
                type="number"
                value={selectedComponent.position[2].toString()} 
                className="bg-secondary"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Rotation X (deg)</Label>
              <Input 
                type="number"
                value={selectedComponent.rotation[0].toString()} 
                className="bg-secondary"
              />
            </div>
            <div className="space-y-2">
              <Label>Rotation Y (deg)</Label>
              <Input 
                type="number"
                value={selectedComponent.rotation[1].toString()} 
                className="bg-secondary"
              />
            </div>
            <div className="space-y-2">
              <Label>Rotation Z (deg)</Label>
              <Input 
                type="number"
                value={selectedComponent.rotation[2].toString()} 
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
                value={selectedComponent.cost ? selectedComponent.cost.toString() : '0'} 
                className="bg-secondary"
              />
            </div>
          </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
