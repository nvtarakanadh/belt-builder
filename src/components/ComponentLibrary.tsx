import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Box, Circle, Zap, Grid3x3, Radio, Settings, ChevronLeft, ChevronRight } from "lucide-react";

const components = [
  {
    id: 'belt',
    name: 'Conveyor Belt',
    icon: Grid3x3,
    category: 'Primary',
    description: 'Main belt assembly'
  },
  {
    id: 'roller',
    name: 'Roller',
    icon: Circle,
    category: 'Primary',
    description: 'Support roller'
  },
  {
    id: 'motor',
    name: 'Drive Motor',
    icon: Zap,
    category: 'Drive System',
    description: 'Electric motor unit'
  },
  {
    id: 'frame',
    name: 'Frame Section',
    icon: Box,
    category: 'Structure',
    description: 'Structural frame'
  },
  {
    id: 'sensor',
    name: 'Proximity Sensor',
    icon: Radio,
    category: 'Controls',
    description: 'Object detection'
  },
  {
    id: 'drive-unit',
    name: 'Drive Unit',
    icon: Settings,
    category: 'Drive System',
    description: 'Gear reducer assembly'
  }
];

interface ComponentLibraryProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ComponentLibrary = ({ collapsed = false, onToggleCollapse }: ComponentLibraryProps) => {
  return (
    <div className={`panel-glass h-full flex flex-col transition-all ${collapsed ? 'w-12' : 'w-80'}`}>
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className={collapsed ? 'hidden' : ''}>
          <h2 className="font-semibold text-lg">Component Library</h2>
          <p className="text-sm text-muted-foreground mt-1">Drag to add to scene</p>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onToggleCollapse}
          className="shrink-0"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className={`p-4 space-y-2 ${collapsed ? 'hidden' : ''}`}>
          {components.map((component) => {
            const Icon = component.icon;
            return (
              <Card 
                key={component.id}
                className="p-3 cursor-move hover:bg-secondary transition-smooth hover:border-primary"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData('application/x-component', JSON.stringify({
                    id: component.id,
                    type: component.id,
                    name: component.name
                  }));
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-sm truncate">{component.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {component.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {component.description}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
