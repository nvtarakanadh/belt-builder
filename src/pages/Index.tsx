import { useState } from 'react';
import { Toolbar } from '@/components/Toolbar';
import { ComponentLibrary } from '@/components/ComponentLibrary';
import { PropertiesPanel } from '@/components/PropertiesPanel';
import { BOMPanel } from '@/components/BOMPanel';
import { Scene } from '@/components/3d/Scene';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ConveyorComponent, BOMItem } from '@/types/conveyor';
import { useToast } from '@/hooks/use-toast';
import { getComponentMeta } from '@/lib/componentLibrary';

const Index = () => {
  const [activeTool, setActiveTool] = useState('select');
  const [selectedComponent, setSelectedComponent] = useState<ConveyorComponent | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'focused' | 'shopfloor'>('focused');
  const [showGrid, setShowGrid] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const { toast } = useToast();
  const [droppedComponents, setDroppedComponents] = useState<ConveyorComponent[]>([]);

  // Undo/Redo with full-state snapshots
  type Snapshot = {
    viewMode: 'focused' | 'shopfloor';
    showGrid: boolean;
    previewMode: boolean;
    droppedComponents: ConveyorComponent[];
    bomItems: BOMItem[];
  };
  const getSnapshot = (): Snapshot => ({
    viewMode,
    showGrid,
    previewMode,
    droppedComponents: JSON.parse(JSON.stringify(droppedComponents)),
    bomItems: JSON.parse(JSON.stringify(bomItems)),
  });
  const applySnapshot = (s: Snapshot) => {
    setViewMode(s.viewMode);
    setShowGrid(s.showGrid);
    setPreviewMode(s.previewMode);
    setDroppedComponents(s.droppedComponents);
    setBomItems(s.bomItems);
  };
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const pushHistory = () => {
    setHistory((h) => [...h, getSnapshot()]);
    setFuture([]);
  };

  // Mock data - in real app this would come from state management
  const mockComponent: ConveyorComponent = {
    id: 'belt-1',
    type: 'belt',
    name: 'Main Conveyor Belt',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: {
      length: 12000,
      width: 2000,
      height: 200
    },
    material: 'rubber',
    specifications: {
      speed: 1.5,
      capacity: 500
    },
    cost: 2500,
    partNumber: 'CVB-12x2-R'
  };

  const mockBOMItems: BOMItem[] = [
    {
      id: '1',
      partNumber: 'CVB-12x2-R',
      description: 'Conveyor Belt Assembly 12m x 2m',
      quantity: 1,
      material: 'Industrial Rubber',
      unitCost: 2500,
      totalCost: 2500
    },
    {
      id: '2',
      partNumber: 'MTR-2.2-IE3',
      description: 'Drive Motor 2.2kW IE3',
      quantity: 1,
      material: 'Steel Housing',
      unitCost: 850,
      totalCost: 850
    },
    {
      id: '3',
      partNumber: 'RLR-150-ST',
      description: 'Support Roller Ø150mm',
      quantity: 7,
      material: 'Steel',
      unitCost: 75,
      totalCost: 525
    },
    {
      id: '4',
      partNumber: 'FRM-12-ALU',
      description: 'Aluminum Frame Section 12m',
      quantity: 2,
      material: 'Aluminum Alloy',
      unitCost: 450,
      totalCost: 900
    },
    {
      id: '5',
      partNumber: 'SNS-PX-24V',
      description: 'Proximity Sensor 24VDC',
      quantity: 2,
      material: 'Plastic/Metal',
      unitCost: 120,
      totalCost: 240
    }
  ];

  const [bomItems, setBomItems] = useState<BOMItem[]>(mockBOMItems);

  const normalizeType = (t: string) => {
    const k = t.toLowerCase().trim();
    const simple = k.replace(/\s+/g, '-');
    const map: Record<string, string> = {
      'drive-motor': 'motor',
      'motor': 'motor',
      'proximity-sensor': 'sensor',
      'sensor': 'sensor',
      'support-roller': 'roller',
      'roller': 'roller',
      'frame-section': 'frame',
      'drive-unit': 'drive-unit',
      'conveyor-belt': 'belt',
      'belt': 'belt'
    };
    return map[simple] || simple;
  };
  const addBomForType = (type: string) => {
    const meta = getComponentMeta(normalizeType(type) as any);
    if (!meta || !meta.bom) return;
    setBomItems((items) => {
      const idx = items.findIndex((i) => i.partNumber === meta.bom!.partNumber);
      if (idx >= 0) {
        const updated = [...items];
        const item = { ...updated[idx] };
        item.quantity += 1;
        item.totalCost = item.quantity * item.unitCost;
        updated[idx] = item;
        return updated;
      }
      const newItem: BOMItem = {
        id: `${meta.bom.partNumber}-${Date.now()}`,
        partNumber: meta.bom.partNumber,
        description: meta.bom.description,
        quantity: 1,
        material: meta.bom.material,
        unitCost: meta.bom.unitCost,
        totalCost: meta.bom.unitCost,
      };
      return [...items, newItem];
    });
  };

  const handleSelectComponent = (id: string) => {
    // In real app, fetch component data based on id
    if (id === 'belt-1' || id === 'motor-1') {
      setSelectedComponent(mockComponent);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Toolbar */}
      <Toolbar 
        onToolSelect={setActiveTool} 
        activeTool={activeTool} 
        viewMode={viewMode}
        onViewModeChange={(mode) => { pushHistory(); setViewMode(mode); }}
        onUndo={() => {
          const last = history[history.length - 1];
          if (!last) return;
          const current = getSnapshot();
          setHistory((h) => h.slice(0, -1));
          setFuture((f) => [current, ...f]);
          applySnapshot(last);
        }}
        onRedo={() => {
          const next = future[0];
          if (!next) return;
          const current = getSnapshot();
          setFuture((f) => f.slice(1));
          setHistory((h) => [...h, current]);
          applySnapshot(next);
        }}
        onToggleGrid={() => {
          pushHistory();
          setShowGrid((v) => !v);
          toast({ title: 'Grid', description: showGrid ? 'Hidden' : 'Shown' });
        }}
        onTogglePreview={() => {
          pushHistory();
          setPreviewMode((v) => !v);
          toast({ title: 'Preview Mode', description: !previewMode ? 'Enabled' : 'Disabled' });
        }}
        onImport={() => toast({ title: 'Import', description: 'Coming soon' })}
        onExport={() => toast({ title: 'Export', description: 'Coming soon' })}
        onSave={() => toast({ title: 'Save Project', description: 'Coming soon' })}
        gridEnabled={showGrid}
        previewEnabled={previewMode}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* Left Sidebar - Component Library */}
        <div className={`shrink-0 transition-all ${leftCollapsed ? 'w-12' : 'w-80'}`}>
          <ComponentLibrary 
            collapsed={leftCollapsed} 
            onToggleCollapse={() => setLeftCollapsed(!leftCollapsed)} 
          />
        </div>

        {/* Center - 3D Viewport */}
        <div className="flex-1 min-w-0">
          <Scene 
            onSelectComponent={handleSelectComponent}
            viewMode={viewMode}
            showGrid={showGrid}
            activeTool={activeTool}
            onDropComponent={(type) => {
              pushHistory();
              const newComp: ConveyorComponent = {
                id: `${type}-${Date.now()}`,
                type: type as any,
                name: type,
                position: [Math.random()*4-2, 0, Math.random()*4-2],
                rotation: [0, 0, 0],
                dimensions: { length: 6, width: 1.2, height: 0.3, diameter: 0.3 },
                material: 'steel',
                specifications: {},
                cost: 0,
                partNumber: ''
              };
              setDroppedComponents((arr) => [...arr, newComp]);
              addBomForType(type);
              toast({ title: 'Added component', description: `Dropped ${type} into scene` });
            }}
            components={droppedComponents}
          />
        </div>

        {/* Right Sidebar - Properties & BOM */}
        <div className={`shrink-0 flex flex-col gap-4 transition-all ${rightCollapsed ? 'w-12' : 'w-96'}`}>
          <div className="flex-1 min-h-0 panel-glass flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <div className={rightCollapsed ? 'hidden' : ''}>
                <h2 className="font-semibold text-lg">Details</h2>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setRightCollapsed(!rightCollapsed)}
                className="shrink-0"
              >
                {rightCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
            <Tabs defaultValue="properties" className={`flex-1 min-h-0 flex flex-col ${rightCollapsed ? 'hidden' : ''}`}>
              <TabsList className="grid w-full grid-cols-2 bg-secondary mx-4 mt-2">
                <TabsTrigger value="properties">Properties</TabsTrigger>
                <TabsTrigger value="bom">BOM</TabsTrigger>
              </TabsList>
              <TabsContent value="properties" className="flex-1 min-h-0 mt-4">
                <PropertiesPanel 
                  selectedComponent={selectedComponent}
                  onUpdateComponent={(component) => {
                    setSelectedComponent(component);
                  }}
                />
              </TabsContent>
              <TabsContent value="bom" className="flex-1 min-h-0 mt-4">
                <BOMPanel items={bomItems} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
